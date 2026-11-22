package uz.shifohalqa.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.time.Instant
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

internal data class DemoConnection(val api: MobileApi, val credentials: MobileCredentials) {
    val token get() = credentials.token
    val scope get() = "${api.address}/${credentials.workspaceId}"
    val expired get() = !credentials.expiresAt.isAfter(Instant.now())
}

internal class DemoConnectionStore(context: Context) {
    private val prefs = context.getSharedPreferences("demo_connection", Context.MODE_PRIVATE)

    fun save(connection: DemoConnection): Boolean = runCatching {
        val json = JSONObject().put("origin", connection.api.address).put("token", connection.token)
            .put("workspace", connection.credentials.workspaceId).put("expiresAt", connection.credentials.expiresAt.toString())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val bytes = cipher.doFinal(json.toString().toByteArray(Charsets.UTF_8))
        prefs.edit().putString("session", Base64.encodeToString(cipher.iv + bytes, Base64.NO_WRAP)).commit()
    }.getOrDefault(false)

    fun read(): DemoConnection? = runCatching {
        val stored = prefs.getString("session", null) ?: return null
        val bytes = Base64.decode(stored, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        val json = JSONObject(cipher.doFinal(bytes, 12, bytes.size - 12).toString(Charsets.UTF_8))
        DemoConnection(MobileApi.forAddress(json.getString("origin")),
            MobileCredentials(json.getString("token"), Instant.parse(json.getString("expiresAt")), json.getString("workspace")))
    }.getOrNull()

    fun clear() { prefs.edit().remove("session").apply() }

    private fun key(): SecretKey {
        val alias = "shifo_demo_connection"
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
}
