package expo.modules.broime

import android.content.Context
import android.net.Uri
import android.view.View
import android.webkit.MimeTypeMap
import androidx.core.view.OnReceiveContentListener
import androidx.core.view.ViewCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Receives image content committed by an Android IME (Gboard, Samsung
 * Keyboard, ...) into the focused composer.
 *
 * React Native's TextInput does not opt into `InputConnection.commitContent`,
 * so the keyboard never offers GIF/sticker content. This module attaches an
 * AndroidX receive-content listener to the focused view; TextView advertises
 * the accepted MIME types and forwards IME content to that listener.
 *
 * The keyboard's URI permission is scoped to the commit callback, so the bytes
 * are copied into the app cache immediately and only that stable file:// URI
 * is handed to JavaScript.
 */
class BroImeModule : Module() {
  private val acceptedMimes = arrayOf(
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  )

  override fun definition() = ModuleDefinition {
    Name("BroIme")

    Events("onRichContent")

    Function("enableRichContent") {
      val activity = appContext.currentActivity ?: return@Function
      val focused = activity.window?.decorView?.findFocus()
      if (focused is android.widget.TextView) {
        attachListener(activity, focused)
      }
    }.runOnQueue(Queues.MAIN)
  }

  private fun attachListener(activity: android.app.Activity, view: View) {
    ViewCompat.setOnReceiveContentListener(
      view,
      acceptedMimes,
      OnReceiveContentListener { _, payload ->
        val clip = payload.clip
        val item = if (clip.itemCount > 0) clip.getItemAt(0) else null
        val uri = item?.uri
        if (uri == null) return@OnReceiveContentListener payload

        val mime = payload.clip.description?.getMimeType(0)
          ?: activity.contentResolver.getType(uri)
          ?: ""

        if (!acceptedMimes.contains(mime.lowercase())) {
          sendEvent("onRichContent", mapOf("error" to "That attachment type is not supported."))
          return@OnReceiveContentListener null
        }

        try {
          val cached = copyToCache(activity, uri, mime)
          sendEvent(
            "onRichContent",
            mapOf(
              "uri" to Uri.fromFile(cached).toString(),
              "mimeType" to mime.lowercase()
            )
          )
        } catch (error: Exception) {
          sendEvent(
            "onRichContent",
            mapOf("error" to (error.message ?: "Could not read that attachment."))
          )
        }
        // Consume the content: the keyboard does not insert it as text.
        null
      }
    )
  }

  private fun copyToCache(context: Context, uri: Uri, mime: String): File {
    val directory = File(context.cacheDir, "keyboard-content").apply { mkdirs() }
    val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "bin"
    val target = File(directory, "ime-${System.currentTimeMillis()}.$extension")

    context.contentResolver.openInputStream(uri)?.use { input ->
      target.outputStream().use { output ->
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0L
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          total += read
          if (total > MAX_BYTES) {
            target.delete()
            throw IllegalArgumentException("That attachment is over 10MB.")
          }
          output.write(buffer, 0, read)
        }
      }
    } ?: throw IllegalArgumentException("Could not open that attachment.")

    return target
  }

  private companion object {
    const val MAX_BYTES = 10L * 1024L * 1024L
  }
}
