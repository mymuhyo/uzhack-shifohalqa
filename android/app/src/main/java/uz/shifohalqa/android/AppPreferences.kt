package uz.shifohalqa.android

import android.content.Context
import androidx.core.content.edit

internal class AppPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("shifo_app_prefs", Context.MODE_PRIVATE)

    var themeMode: ThemeMode
        get() = ThemeMode.fromKey(prefs.getString("theme_mode", ThemeMode.System.key))
        set(value) = prefs.edit { putString("theme_mode", value.key) }

    var largeText: Boolean
        get() = prefs.getBoolean("large_text", false)
        set(value) = prefs.edit { putBoolean("large_text", value) }

    var poseModelMode: PoseModelMode
        get() = PoseModelMode.fromKey(prefs.getString("pose_model_mode", PoseModelMode.Full.key))
        set(value) = prefs.edit { putString("pose_model_mode", value.key) }

    var lastOrigin: String
        get() = prefs.getString("last_origin", null) ?: if (BuildConfig.DEBUG) LOCAL_DEMO_ORIGIN else ""
        set(value) = prefs.edit { putString("last_origin", value) }

    fun readCachedToday(scope: String): String? = prefs.getString("today_$scope", null)
    fun saveCachedToday(scope: String, json: String) = prefs.edit { putString("today_$scope", json) }

    fun readCachedBrief(scope: String): String? = prefs.getString("brief_$scope", null)
    fun saveCachedBrief(scope: String, json: String) = prefs.edit { putString("brief_$scope", json) }
    fun clearCachedBrief(scope: String) = prefs.edit { remove("brief_$scope") }
}
