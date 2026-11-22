package uz.shifohalqa.android

import android.os.ParcelFileDescriptor
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestRule
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ExerciseFlowTest {
    @get:Rule(order = 0) val standalone: TestRule = StandaloneDemoRule()
    @get:Rule(order = 1) val compose = createAndroidComposeRule<MainActivity>()

    @Before fun allowCamera() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val targetPackage = instrumentation.targetContext.packageName
        val command = instrumentation.uiAutomation.executeShellCommand("pm grant $targetPackage android.permission.CAMERA")
        ParcelFileDescriptor.AutoCloseInputStream(command).use { it.readBytes() }
    }

    @Test fun stoppingCameraOffersManualFallbackAndKeepsEmergencyAccess() {
        compose.onNodeWithText("O‘tirib-turish mashqi").performScrollTo().performClick()
        compose.onNodeWithText("Kamerani boshlash").performClick()
        compose.onNodeWithText("To‘xtatish").assertExists()
        compose.waitUntil(timeoutMillis = 20_000) {
            compose.onAllNodesWithText("Yon tomoningiz", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("Tez yordam · 103").assertExists()
        compose.onNodeWithText("To‘xtatish").performClick()
        compose.onNodeWithText("To‘xtatish").assertDoesNotExist()
        compose.onNode(hasSetTextAction()).performScrollTo().performTextInput("3")
        compose.onNodeWithText("Qo‘lda qayd saqlash").performScrollTo().performClick()
        compose.onNodeWithText("Namuna qaydi. Shifokorga yuborish uchun veb-panelga ulang.").assertExists()
        compose.onNodeWithText("AI tahlilchi · CDC namunasi").performScrollTo().performClick()
        compose.onNodeWithText("OpenRouter va Baidu uchun veb-panelga ulang.").assertExists()
    }

    @Test fun choosesAnotherMovementForOfflinePractice() {
        compose.onNodeWithText("O‘tirib-turish mashqi").performScrollTo().performClick()
        compose.onNodeWithText("Mashq turini tanlash").performClick()
        compose.onNodeWithText("Qo‘l ko‘tarish").performClick()
        compose.onNodeWithText("Qo‘lni yelkadan ko‘tarish").assertExists()
        compose.onNodeWithText("Kamerani boshlash").assertExists()
        compose.onNodeWithText("Video tanlash va tahlil qilish").assertExists()
    }

    @Test fun painStopsCameraAndKeepsEmergencyAccess() {
        compose.onNodeWithText("O‘tirib-turish mashqi").performScrollTo().performClick()
        compose.onNodeWithText("Kamerani boshlash").performClick()
        compose.onNodeWithText("Og‘riq bor").performClick()
        compose.onNodeWithText("To‘xtatish").assertDoesNotExist()
        compose.onNodeWithText("Tez yordam · 103").assertExists()
        compose.onNodeWithText("Namuna qaydi. Shifokorga yuborish uchun veb-panelga ulang.").assertExists()
    }
}
