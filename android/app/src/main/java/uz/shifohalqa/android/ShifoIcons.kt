package uz.shifohalqa.android

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

internal object ShifoIcons {
    val Today: ImageVector by lazy {
        lucideIcon("Today") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(5f, 4f); lineTo(19f, 4f); arcTo(2f, 2f, 0f, false, true, 21f, 6f)
                lineTo(21f, 19f); arcTo(2f, 2f, 0f, false, true, 19f, 21f)
                lineTo(5f, 21f); arcTo(2f, 2f, 0f, false, true, 3f, 19f)
                lineTo(3f, 6f); arcTo(2f, 2f, 0f, false, true, 5f, 4f); close()
                moveTo(8f, 2f); lineTo(8f, 6f)
                moveTo(16f, 2f); lineTo(16f, 6f)
                moveTo(3f, 10f); lineTo(21f, 10f)
            }
        }
    }

    val Exercise: ImageVector by lazy {
        lucideIcon("Exercise") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(6f, 7f); lineTo(6f, 17f)
                moveTo(18f, 7f); lineTo(18f, 17f)
                moveTo(3f, 9.5f); lineTo(3f, 14.5f)
                moveTo(21f, 9.5f); lineTo(21f, 14.5f)
                moveTo(6f, 12f); lineTo(18f, 12f)
            }
        }
    }

    val Report: ImageVector by lazy {
        lucideIcon("Report") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(21f, 15f); arcTo(2f, 2f, 0f, false, true, 19f, 17f)
                lineTo(7f, 17f); lineTo(3f, 21f); lineTo(3f, 5f)
                arcTo(2f, 2f, 0f, false, true, 5f, 3f); lineTo(19f, 3f)
                arcTo(2f, 2f, 0f, false, true, 21f, 5f); close()
                moveTo(7f, 8.5f); lineTo(16f, 8.5f)
                moveTo(7f, 12.5f); lineTo(13f, 12.5f)
            }
        }
    }

    val Pill: ImageVector by lazy {
        lucideIcon("Pill") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(10.5f, 20.5f); lineTo(20.5f, 10.5f)
                arcTo(4.95f, 4.95f, 0f, true, false, 13.5f, 3.5f)
                lineTo(3.5f, 13.5f)
                arcTo(4.95f, 4.95f, 0f, true, false, 10.5f, 20.5f); close()
                moveTo(8.5f, 8.5f); lineTo(15.5f, 15.5f)
            }
        }
    }

    val HeartPulse: ImageVector by lazy {
        lucideIcon("HeartPulse") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(3f, 12f); lineTo(7f, 12f); lineTo(9.5f, 6.5f); lineTo(13.5f, 17.5f)
                lineTo(16.5f, 12f); lineTo(21f, 12f)
            }
        }
    }

    val Steps: ImageVector by lazy {
        lucideIcon("Steps") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(4f, 18f); lineTo(8f, 14f); lineTo(12f, 16f); lineTo(20f, 7f)
                moveTo(15f, 7f); lineTo(20f, 7f); lineTo(20f, 12f)
            }
        }
    }

    val Phone: ImageVector by lazy {
        lucideIcon("Phone") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(22f, 16.92f); verticalLineToRelative(3f)
                arcTo(2f, 2f, 0f, false, true, 19.82f, 22f)
                arcTo(19.79f, 19.79f, 0f, false, true, 2f, 4.18f)
                arcTo(2f, 2f, 0f, false, true, 4.11f, 2f); horizontalLineToRelative(3f)
                arcTo(2f, 2f, 0f, false, true, 9.11f, 3.72f)
                lineToRelative(0.7f, 2.81f); arcTo(2f, 2f, 0f, false, true, 9.36f, 8.64f)
                lineToRelative(-1.27f, 1.27f); arcTo(16f, 16f, 0f, false, false, 14.09f, 15.91f)
                lineToRelative(1.27f, -1.27f); arcTo(2f, 2f, 0f, false, true, 17.47f, 14.19f)
                lineToRelative(2.81f, 0.7f); arcTo(2f, 2f, 0f, false, true, 22f, 16.92f); close()
            }
        }
    }

    val Alert: ImageVector by lazy {
        lucideIcon("Alert") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(12f, 3f); lineTo(21f, 19f); lineTo(3f, 19f); close()
                moveTo(12f, 9.5f); lineTo(12f, 13.5f)
                moveTo(12f, 16.5f); lineTo(12.01f, 16.5f)
            }
        }
    }

    val Camera: ImageVector by lazy {
        lucideIcon("Camera") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(4f, 7f); lineTo(7.5f, 7f); lineTo(9.2f, 4.5f); lineTo(14.8f, 4.5f); lineTo(16.5f, 7f); lineTo(20f, 7f)
                arcTo(2f, 2f, 0f, false, true, 22f, 9f); lineTo(22f, 18f)
                arcTo(2f, 2f, 0f, false, true, 20f, 20f); lineTo(4f, 20f)
                arcTo(2f, 2f, 0f, false, true, 2f, 18f); lineTo(2f, 9f)
                arcTo(2f, 2f, 0f, false, true, 4f, 7f); close()
                moveTo(15.5f, 13f); arcTo(3.5f, 3.5f, 0f, true, true, 8.5f, 13f); arcTo(3.5f, 3.5f, 0f, true, true, 15.5f, 13f); close()
            }
        }
    }

    val Video: ImageVector by lazy {
        lucideIcon("Video") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(3f, 6f); lineTo(15f, 6f); arcTo(2f, 2f, 0f, false, true, 17f, 8f)
                lineTo(17f, 16f); arcTo(2f, 2f, 0f, false, true, 15f, 18f)
                lineTo(3f, 18f); arcTo(2f, 2f, 0f, false, true, 1f, 16f)
                lineTo(1f, 8f); arcTo(2f, 2f, 0f, false, true, 3f, 6f); close()
                moveTo(17f, 10.5f); lineTo(22.5f, 7.2f); lineTo(22.5f, 16.8f); lineTo(17f, 13.5f); close()
            }
        }
    }

    val Upload: ImageVector by lazy {
        lucideIcon("Upload") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(12f, 16f); lineTo(12f, 4f)
                moveTo(7.5f, 8.5f); lineTo(12f, 4f); lineTo(16.5f, 8.5f)
                moveTo(4f, 17f); lineTo(4f, 19.5f); lineTo(20f, 19.5f); lineTo(20f, 17f)
            }
        }
    }

    val Check: ImageVector by lazy {
        lucideIcon("Check") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 2.0f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(4.5f, 12.5f); lineTo(9.5f, 17.5f); lineTo(19.5f, 6.5f)
            }
        }
    }

    val Settings: ImageVector by lazy {
        lucideIcon("Settings") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(4f, 7f); lineTo(20f, 7f)
                moveTo(4f, 12f); lineTo(20f, 12f)
                moveTo(4f, 17f); lineTo(20f, 17f)
                moveTo(9f, 5f); lineTo(9f, 9f)
                moveTo(15f, 10f); lineTo(15f, 14f)
                moveTo(11f, 15f); lineTo(11f, 19f)
            }
        }
    }

    val Refresh: ImageVector by lazy {
        lucideIcon("Refresh") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(20f, 11f); arcTo(8f, 8f, 0f, false, false, 6.3f, 6.3f); lineTo(4f, 8.5f)
                moveTo(4f, 4f); lineTo(4f, 8.5f); lineTo(8.5f, 8.5f)
                moveTo(4f, 13f); arcTo(8f, 8f, 0f, false, false, 17.7f, 17.7f); lineTo(20f, 15.5f)
                moveTo(20f, 20f); lineTo(20f, 15.5f); lineTo(15.5f, 15.5f)
            }
        }
    }

    val Sparkles: ImageVector by lazy {
        lucideIcon("Sparkles") {
            path(stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(12f, 3f); lineTo(13.8f, 8.2f); lineTo(19f, 10f); lineTo(13.8f, 11.8f)
                lineTo(12f, 17f); lineTo(10.2f, 11.8f); lineTo(5f, 10f); lineTo(10.2f, 8.2f); close()
                moveTo(18.5f, 16f); lineTo(19.3f, 18.2f); lineTo(21.5f, 19f); lineTo(19.3f, 19.8f)
                lineTo(18.5f, 22f); lineTo(17.7f, 19.8f); lineTo(15.5f, 19f); lineTo(17.7f, 18.2f); close()
            }
        }
    }
}

private inline fun lucideIcon(
    name: String,
    block: ImageVector.Builder.() -> Unit,
): ImageVector = ImageVector.Builder(
    name = name,
    defaultWidth = 24.dp,
    defaultHeight = 24.dp,
    viewportWidth = 24f,
    viewportHeight = 24f,
).apply {
    block()
}.build()
