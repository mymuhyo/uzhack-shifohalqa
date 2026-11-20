package uz.shifohalqa.android

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PatientFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Before
    fun startWithEmptyDemo() {
        compose.runOnIdle { PatientDemo(compose.activity).reset() }
        compose.activityRule.scenario.recreate()
    }

    @Test
    fun missedDoseRequiresReasonAndShowsExplicitSampleReply() {
        tap("Icha olmadim")
        compose.onNodeWithText("Qaydni saqlash").assertIsNotEnabled()
        tap("Dori tugadi")
        compose.onNodeWithText("Dori tugadi").assertIsSelected()
        compose.onNodeWithText("Qaydni saqlash").assertIsEnabled()
        tap("Qaydni saqlash")
        tap("Qaydni ko‘rish")
        compose.onNodeWithText("Shifokor ko‘rib chiqdi").assertDoesNotExist()
        tap("Namuna javobni ochish")
        compose.onNodeWithText("Shifokor ko‘rib chiqdi").assertExists()
        compose.onNodeWithText("Namuna javob").assertExists()
        compose.activityRule.scenario.recreate()
        compose.onNodeWithText("Namuna javob").assertExists()
    }

    @Test
    fun cancelLeavesTaskOpenAndTakenPersistsAfterRecreation() {
        tap("Ichdim")
        tap("Bekor qilish")
        compose.onNodeWithText("1 ta vazifa qoldi").assertExists()
        tap("Ichdim")
        tap("Qaydni saqlash")
        compose.onNodeWithText("Qayd saqlandi").assertExists()
        compose.activityRule.scenario.recreate()
        compose.onNodeWithText("Qayd saqlandi").assertExists()
        tap("Javoblar")
        compose.onNodeWithText("Hozircha javob yo‘q").assertExists()
    }

    @Test
    fun resetRequiresConfirmationAndStartsFresh() {
        tap("Ichdim")
        tap("Qaydni saqlash")
        tap("Javoblar")
        tap("Demoni qayta boshlash")
        tap("Bekor qilish")
        compose.onNodeWithText("Demoni qayta boshlash").assertExists()
        tap("Demoni qayta boshlash")
        tap("Qayta boshlash")
        compose.onNodeWithText("1 ta vazifa qoldi").assertExists()
    }

    private fun tap(text: String) = compose.onNodeWithText(text).performClick()
}
