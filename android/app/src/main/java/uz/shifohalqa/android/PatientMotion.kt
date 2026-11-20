package uz.shifohalqa.android

import android.animation.ValueAnimator
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp

internal val SettleEasing = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)

@Composable
internal fun SoftReveal(delayMs: Int, content: @Composable () -> Unit) {
    if (!ValueAnimator.areAnimatorsEnabled()) {
        content()
        return
    }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(progress, delayMs) {
        progress.animateTo(1f, tween(320, delayMillis = delayMs, easing = SettleEasing))
    }
    Box(Modifier.graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * 10.dp.toPx()
    }) { content() }
}

@Composable
internal fun Modifier.pressResponse(interactionSource: MutableInteractionSource): Modifier {
    val pressed by interactionSource.collectIsPressedAsState()
    val scale = animateFloatAsState(
        targetValue = if (pressed) 0.975f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium),
        label = "Button press",
    )
    return graphicsLayer {
        scaleX = scale.value
        scaleY = scale.value
    }
}
