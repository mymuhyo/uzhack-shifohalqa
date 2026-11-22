package uz.shifohalqa.android

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import org.json.JSONArray
import org.json.JSONObject

internal data class ExercisePlan(
    val id: String, val targetAngle: Int, val targetReps: Int,
    val movement: PoseMovement = PoseMovement.ChairStand, val maxShallow: Int = 1,
)
internal data class ExerciseReview(val body: String, val retake: Boolean)
internal data class ExerciseAttempt(
    val id: String, val date: String, val title: String, val reps: Int?, val shallow: Int?, val level: Int,
    val review: ExerciseReview?,
    val movement: PoseMovement = PoseMovement.ChairStand,
)

internal data class ExerciseView(val plan: ExercisePlan?, val attempts: List<ExerciseAttempt>, val json: String) {
    companion object {
        fun parse(data: JSONObject): ExerciseView {
            val plan = data.optJSONObject("plan")?.let {
                ExercisePlan(it.getString("id"), it.getInt("targetAngle"), it.getInt("targetReps"),
                    PoseMovement.fromApiKey(it.optString("movement")), it.optInt("maxShallow", 1))
            }
            val attempts = data.getJSONArray("attempts")
            val history = List(attempts.length()) { index ->
                val entry = attempts.getJSONObject(index)
                val level = entry.getInt("level")
                val title = when {
                    entry.getBoolean("sample") -> "CDC namuna videosi"
                    entry.getString("reason") == "pain" -> "Og‘riq xabari"
                    entry.getString("reason") == "manual" -> "Qo‘lda qayd"
                    level == 2 -> "Video o‘lchovi"
                    else -> "Kamera o‘lchovi"
                }
                val review = entry.optJSONObject("review")?.let {
                    ExerciseReview(it.getString("body"), it.getString("decision") == "retake")
                }
                ExerciseAttempt(entry.getString("id"), entry.getString("scheduledDate"), title,
                    entry.optInt("validReps", -1).takeIf { it >= 0 },
                    entry.optInt("shallowReps", -1).takeIf { it >= 0 }, level, review, PoseMovement.fromApiKey(entry.optString("movement")))
            }
            return ExerciseView(plan, history, data.toString())
        }
    }
}

@Entity
internal data class ExerciseSnapshot(@PrimaryKey val scope: String, val json: String)

@Entity
internal data class ExerciseOutbox(
    @PrimaryKey val id: String,
    val scope: String,
    val payload: String,
    val label: String,
    val createdAt: Long,
    val status: String = "pending",
    val serverId: String? = null,
)

@Dao
internal interface ExerciseDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun cache(snapshot: ExerciseSnapshot)

    @Query("SELECT json FROM ExerciseSnapshot WHERE scope = :scope")
    fun snapshot(scope: String): Flow<String?>

    @Insert
    suspend fun queue(attempt: ExerciseOutbox)

    @Query("SELECT * FROM ExerciseOutbox WHERE scope = :scope ORDER BY createdAt DESC LIMIT 30")
    fun outbox(scope: String): Flow<List<ExerciseOutbox>>

    @Query("SELECT id FROM ExerciseOutbox WHERE scope = :scope AND status = 'pending'")
    suspend fun pending(scope: String): List<String>

    @Query("SELECT * FROM ExerciseOutbox WHERE id = :id AND status = 'pending'")
    suspend fun attempt(id: String): ExerciseOutbox?

    @Query("UPDATE ExerciseOutbox SET status = :status, serverId = :serverId WHERE id = :id")
    suspend fun finish(id: String, status: String, serverId: String? = null)

    @Query("DELETE FROM ExerciseOutbox WHERE id = :id AND scope = :scope AND status = 'rejected'")
    suspend fun discard(id: String, scope: String)

    @Query("DELETE FROM ExerciseOutbox WHERE status != 'pending' AND createdAt < :before")
    suspend fun prune(before: Long)
}

@Database(entities = [ExerciseSnapshot::class, ExerciseOutbox::class], version = 1, exportSchema = false)
internal abstract class ExerciseDatabase : RoomDatabase() {
    abstract fun exerciseDao(): ExerciseDao

    companion object {
        @Volatile private var instance: ExerciseDatabase? = null

        fun open(context: Context) = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, ExerciseDatabase::class.java, "rehabilitation.db")
                .build().also { instance = it }
        }
    }
}

internal class ExerciseRepository(context: Context) {
    private val app = context.applicationContext
    val dao = ExerciseDatabase.open(app).exerciseDao()

    suspend fun refresh(connection: DemoConnection) {
        val view = connection.api.exercise(connection.token)
        dao.cache(ExerciseSnapshot(connection.scope, view.json))
        dao.prune(System.currentTimeMillis() - 7 * 86_400_000L)
    }

    suspend fun queue(connection: DemoConnection, plan: ExercisePlan, evidence: JSONObject, label: String, date: LocalDate) {
        val id = UUID.randomUUID().toString()
        val payload = JSONObject().put("clientAttemptId", id).put("prescriptionId", plan.id)
            .put("scheduledDate", date.toString()).put("evidence", evidence)
        dao.queue(ExerciseOutbox(id, connection.scope, payload.toString(), label, System.currentTimeMillis()))
        schedule(id)
    }

    suspend fun resume(connection: DemoConnection) {
        dao.pending(connection.scope).forEach(::schedule)
    }

    private fun schedule(id: String) {
        val request = OneTimeWorkRequestBuilder<ExerciseSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInputData(workDataOf("attemptId" to id)).build()
        WorkManager.getInstance(app).enqueueUniqueWork("exercise-$id", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }
}

class ExerciseSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val id = inputData.getString("attemptId") ?: return Result.failure()
        val repository = ExerciseRepository(applicationContext)
        val attempt = repository.dao.attempt(id) ?: return Result.success()
        val session = DemoConnectionStore(applicationContext).read() ?: return Result.success()
        if (session.expired || session.scope != attempt.scope) return Result.success()
        val serverId = try {
            session.api.sendExercise(session.token, JSONObject(attempt.payload))
        } catch (failure: MobileFailure) {
            return when (failure.kind) {
                MobileFailureKind.Expired -> Result.success()
                MobileFailureKind.NotFound, MobileFailureKind.Rejected -> {
                    repository.dao.finish(id, "rejected")
                    Result.success()
                }
                else -> Result.retry()
            }
        }
        repository.dao.finish(id, "sent", serverId)
        return Result.success()
    }
}

internal fun exerciseToday(): LocalDate = LocalDate.now(ZoneId.of("Asia/Tashkent"))

internal fun ExerciseMeasurement.asEvidence(fileSha256: String? = null): JSONObject = (pose?.toExerciseApiPayload() ?: JSONObject())
    .put("source", if (fileSha256 == null) "live_camera" else "uploaded_video")
    .put("patientConfirmed", true).put("fileSha256", fileSha256 ?: JSONObject.NULL)
    .put("validReps", validReps).put("shallowReps", shallowReps)
    .put("minAngle", minAngle ?: JSONObject.NULL).put("confidence", confidence ?: JSONObject.NULL)
    .put("analyzedFrames", analyzedFrames)
    .put("motionSignature", motionSignature?.let(::JSONArray) ?: JSONObject.NULL)
