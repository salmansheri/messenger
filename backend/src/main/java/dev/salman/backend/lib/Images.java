package dev.salman.backend.lib;

import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Set;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;

import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.PayloadTooLargeException;

/**
 * Decides whether bytes are an allowed image by decoding them, and produces the copies we store: re-encoded from the
 * decoded pixels (so no EXIF, GPS or any other metadata survives), turned upright if the camera said so, plus a
 * thumbnail. A JPEG stays a JPEG; PNG, GIF (first frame) and WebP are stored as PNG.
 */
public final class Images {

	public static final long MAX_BYTES = 10L * 1024 * 1024;
	public static final int MAX_SIDE = 8000;
	/** Decoding allocates width x height x 4 bytes, so the area is capped as well as each side. */
	public static final long MAX_PIXELS = 40_000_000L;
	public static final int THUMBNAIL_WIDTH = 480;
	public static final int AVATAR_SIDE = 256;

	private static final Set<String> ALLOWED = Set.of("png", "jpeg", "gif", "webp");
	private static final float JPEG_QUALITY = 0.85f;

	private Images() {
	}

	/** The stored image, its thumbnail, the (upright) size and how they are encoded. */
	public record Processed(byte[] full, byte[] thumbnail, int width, int height, String contentType,
			String extension) {
	}

	public static Processed process(byte[] bytes) {
		var prepared = prepare(bytes);
		try {
			var full = encode(prepared.image(), prepared.jpeg());
			var thumbnail = encode(shrink(prepared.image(), THUMBNAIL_WIDTH), prepared.jpeg());
			return new Processed(full, thumbnail, prepared.image().getWidth(), prepared.image().getHeight(),
					prepared.jpeg() ? "image/jpeg" : "image/png", prepared.jpeg() ? "jpg" : "png");
		}
		catch (IOException | RuntimeException e) {
			throw notAnImage();
		}
	}

	/** A square picture of {@link #AVATAR_SIDE} pixels and how it is encoded. */
	public record Avatar(byte[] bytes, String contentType, String extension) {
	}

	/**
	 * The centre square of the picture, scaled to {@link #AVATAR_SIDE} pixels, under the same rules and with the same
	 * cleaning as {@link #process}.
	 */
	public static Avatar avatar(byte[] bytes) {
		var prepared = prepare(bytes);
		try {
			var source = prepared.image();
			var side = Math.min(source.getWidth(), source.getHeight());
			var square = source.getSubimage((source.getWidth() - side) / 2, (source.getHeight() - side) / 2, side, side);
			var scaled = new BufferedImage(AVATAR_SIDE, AVATAR_SIDE, BufferedImage.TYPE_INT_ARGB);
			var g = scaled.createGraphics();
			g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
			g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
			g.drawImage(square, 0, 0, AVATAR_SIDE, AVATAR_SIDE, null);
			g.dispose();
			return new Avatar(encode(scaled, prepared.jpeg()), prepared.jpeg() ? "image/jpeg" : "image/png",
					prepared.jpeg() ? "jpg" : "png");
		}
		catch (IOException | RuntimeException e) {
			throw notAnImage();
		}
	}

	private record Prepared(BufferedImage image, boolean jpeg) {
	}

	/** Checks the bytes (empty, too large, not an allowed image, too many pixels), decodes them and turns them upright. */
	private static Prepared prepare(byte[] bytes) {
		if (bytes.length == 0) {
			throw new BadRequestException("The file is empty.");
		}
		if (bytes.length > MAX_BYTES) {
			throw new PayloadTooLargeException("The image is larger than 10 MB.");
		}
		try {
			var decoded = decode(bytes);
			var jpeg = decoded.format().equals("jpeg");
			return new Prepared(turnUpright(decoded.image(), jpeg ? orientationOf(bytes) : 1), jpeg);
		}
		catch (IOException | RuntimeException e) {
			if (e instanceof BadRequestException bad) {
				throw bad;
			}
			throw notAnImage();
		}
	}

	private record Decoded(BufferedImage image, String format) {
	}

	private static Decoded decode(byte[] bytes) throws IOException {
		try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
			if (stream == null) {
				throw notAnImage();
			}
			var readers = ImageIO.getImageReaders(stream);
			while (readers.hasNext()) {
				ImageReader reader = readers.next();
				var format = reader.getFormatName().toLowerCase();
				if (!ALLOWED.contains(format)) {
					reader.dispose();
					continue;
				}
				try {
					reader.setInput(stream, true, true);
					long width = reader.getWidth(0);
					long height = reader.getHeight(0);
					if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
						throw new BadRequestException(
								"The image is too large in pixels. Use one up to 8000 pixels on a side.");
					}
					return new Decoded(reader.read(0), format);
				}
				finally {
					reader.dispose();
				}
			}
		}
		throw notAnImage();
	}

	private static BadRequestException notAnImage() {
		return new BadRequestException("That file is not a supported image. Use a PNG, JPEG, WebP or GIF.");
	}

	/** The EXIF orientation (1 to 8) of a JPEG, or 1 when it has none. */
	static int orientationOf(byte[] jpeg) {
		var i = 2;
		while (i + 4 <= jpeg.length && (jpeg[i] & 0xFF) == 0xFF) {
			var marker = jpeg[i + 1] & 0xFF;
			var length = ((jpeg[i + 2] & 0xFF) << 8) | (jpeg[i + 3] & 0xFF);
			if (marker == 0xDA || length < 2) {
				return 1;
			}
			var start = i + 4;
			if (marker == 0xE1 && start + 14 <= jpeg.length && jpeg[start] == 'E' && jpeg[start + 1] == 'x'
					&& jpeg[start + 2] == 'i' && jpeg[start + 3] == 'f') {
				return orientationInTiff(jpeg, start + 6, Math.min(jpeg.length, i + 2 + length));
			}
			i += 2 + length;
		}
		return 1;
	}

	private static int orientationInTiff(byte[] b, int tiff, int end) {
		if (tiff + 8 > end) {
			return 1;
		}
		var little = b[tiff] == 'I';
		var ifd = tiff + (int) number(b, tiff + 4, 4, little);
		if (ifd < tiff || ifd + 2 > end) {
			return 1;
		}
		var entries = (int) number(b, ifd, 2, little);
		for (var n = 0; n < entries; n++) {
			var entry = ifd + 2 + n * 12;
			if (entry + 12 > end) {
				return 1;
			}
			if (number(b, entry, 2, little) == 0x0112) {
				var value = (int) number(b, entry + 8, 2, little);
				return value >= 1 && value <= 8 ? value : 1;
			}
		}
		return 1;
	}

	private static long number(byte[] b, int at, int size, boolean little) {
		long value = 0;
		for (var n = 0; n < size; n++) {
			var octet = b[at + (little ? size - 1 - n : n)] & 0xFFL;
			value = (value << 8) | octet;
		}
		return value;
	}

	private static BufferedImage turnUpright(BufferedImage source, int orientation) {
		if (orientation == 1) {
			return source;
		}
		var w = source.getWidth();
		var h = source.getHeight();
		var swap = orientation >= 5;
		var transform = switch (orientation) {
			case 2 -> new AffineTransform(-1, 0, 0, 1, w, 0);
			case 3 -> new AffineTransform(-1, 0, 0, -1, w, h);
			case 4 -> new AffineTransform(1, 0, 0, -1, 0, h);
			case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
			case 6 -> new AffineTransform(0, 1, -1, 0, h, 0);
			case 7 -> new AffineTransform(0, -1, -1, 0, h, w);
			default -> new AffineTransform(0, -1, 1, 0, 0, w);
		};
		var target = new BufferedImage(swap ? h : w, swap ? w : h, BufferedImage.TYPE_INT_ARGB);
		var g = target.createGraphics();
		g.drawImage(source, transform, null);
		g.dispose();
		return target;
	}

	private static BufferedImage shrink(BufferedImage source, int maxWidth) {
		if (source.getWidth() <= maxWidth) {
			return source;
		}
		var height = Math.max(1, Math.round((float) source.getHeight() * maxWidth / source.getWidth()));
		var target = new BufferedImage(maxWidth, height, BufferedImage.TYPE_INT_ARGB);
		var g = target.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
		g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
		g.drawImage(source, 0, 0, maxWidth, height, null);
		g.dispose();
		return target;
	}

	private static byte[] encode(BufferedImage source, boolean jpeg) throws IOException {
		var out = new ByteArrayOutputStream();
		if (jpeg) {
			var rgb = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
			var g = rgb.createGraphics();
			g.drawImage(source, 0, 0, Color.WHITE, null);
			g.dispose();
			var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
			try (var stream = ImageIO.createImageOutputStream(out)) {
				var params = writer.getDefaultWriteParam();
				params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
				params.setCompressionQuality(JPEG_QUALITY);
				writer.setOutput(stream);
				writer.write(null, new IIOImage(rgb, null, null), params);
			}
			finally {
				writer.dispose();
			}
		}
		else {
			var argb = source.getType() == BufferedImage.TYPE_INT_ARGB ? source : copyAsArgb(source);
			ImageIO.write(argb, "png", out);
		}
		return out.toByteArray();
	}

	private static BufferedImage copyAsArgb(BufferedImage source) {
		var copy = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_ARGB);
		var g = copy.createGraphics();
		g.drawImage(source, 0, 0, null);
		g.dispose();
		return copy;
	}

}
