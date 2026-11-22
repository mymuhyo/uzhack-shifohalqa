package uz.shifohalqa.android

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.rules.ExternalResource

internal class StandaloneDemoRule : ExternalResource() {
    override fun before() {
        DemoConnectionStore(InstrumentationRegistry.getInstrumentation().targetContext).clear()
    }
}
