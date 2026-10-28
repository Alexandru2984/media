use axum::body::Bytes;
use image::{
    codecs::{
        jpeg::JpegEncoder,
        png::{CompressionType, FilterType, PngEncoder},
        webp::WebPEncoder,
    },
    imageops, DynamicImage, GenericImageView, ImageDecoder, ImageFormat as DecoderFormat,
    ImageReader, Limits,
};
use std::io::{self, Cursor, Write};
use tokio::sync::Semaphore;

const MAX_IMAGE_DIMENSION: u32 = 8_192;
const MAX_IMAGE_PIXELS: u64 = 16_000_000;
const MAX_DECODED_BYTES: u64 = 96 * 1024 * 1024;
const MAXIMUM_CONCURRENT_IMAGE_JOBS: usize = 2;
const MAX_AVATAR_DIMENSION: u32 = 1_024;
const JPEG_QUALITY: u8 = 88;

static IMAGE_JOB_LIMIT: Semaphore = Semaphore::const_new(MAXIMUM_CONCURRENT_IMAGE_JOBS);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum StoredImageFormat {
    Jpeg,
    Png,
    Webp,
}

impl StoredImageFormat {
    fn canonical_extension(self) -> &'static str {
        match self {
            Self::Jpeg => "jpg",
            Self::Png => "png",
            Self::Webp => "webp",
        }
    }

    fn media_type(self) -> &'static str {
        match self {
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
            Self::Webp => "image/webp",
        }
    }

    fn accepts_extension(self, extension: &str) -> bool {
        match self {
            Self::Jpeg => matches!(extension, "jpg" | "jpeg"),
            Self::Png => extension == "png",
            Self::Webp => extension == "webp",
        }
    }

    fn decoder_format(self) -> DecoderFormat {
        match self {
            Self::Jpeg => DecoderFormat::Jpeg,
            Self::Png => DecoderFormat::Png,
            Self::Webp => DecoderFormat::WebP,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ImagePurpose {
    Avatar,
    Post,
}

#[derive(Debug, Eq, PartialEq)]
pub enum ImageProcessingError {
    InvalidImage,
    OutputTooLarge,
    WorkerUnavailable,
}

#[derive(Debug)]
pub struct ProcessedImage {
    pub extension: &'static str,
    pub data: Vec<u8>,
}

pub async fn process_uploaded_image(
    filename: &str,
    content_type: Option<&str>,
    data: Bytes,
    purpose: ImagePurpose,
    max_output_bytes: usize,
) -> Result<ProcessedImage, ImageProcessingError> {
    let format = validated_image_format(filename, content_type, &data)
        .ok_or(ImageProcessingError::InvalidImage)?;
    let permit = IMAGE_JOB_LIMIT
        .acquire()
        .await
        .map_err(|_| ImageProcessingError::WorkerUnavailable)?;

    tokio::task::spawn_blocking(move || {
        // Keep the permit inside the blocking job. A disconnected request must
        // not let decoder work escape the global concurrency budget.
        let _permit = permit;
        decode_and_reencode(&data, format, purpose, max_output_bytes)
    })
    .await
    .map_err(|_| ImageProcessingError::WorkerUnavailable)?
}

fn validated_image_format(
    filename: &str,
    content_type: Option<&str>,
    data: &[u8],
) -> Option<StoredImageFormat> {
    let extension = std::path::Path::new(filename)
        .extension()?
        .to_str()?
        .to_ascii_lowercase();
    let (format, width, height) = detect_image(data)?;

    if !format.accepts_extension(&extension) || content_type != Some(format.media_type()) {
        return None;
    }

    if width == 0
        || height == 0
        || width > MAX_IMAGE_DIMENSION
        || height > MAX_IMAGE_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return None;
    }

    Some(format)
}

fn decoding_limits() -> Limits {
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    limits.max_alloc = Some(MAX_DECODED_BYTES);
    limits
}

fn image_reader(data: &[u8], format: StoredImageFormat) -> ImageReader<Cursor<&[u8]>> {
    let mut reader = ImageReader::new(Cursor::new(data));
    reader.set_format(format.decoder_format());
    reader.limits(decoding_limits());
    reader
}

fn decode_and_reencode(
    data: &[u8],
    format: StoredImageFormat,
    purpose: ImagePurpose,
    max_output_bytes: usize,
) -> Result<ProcessedImage, ImageProcessingError> {
    // Read orientation separately so the actual decode can keep ImageReader's
    // allocation checks. The explicit total-byte cap also protects the
    // orientation path from decoder-specific best-effort allocation limits.
    let orientation = {
        let mut decoder = image_reader(data, format)
            .into_decoder()
            .map_err(|_| ImageProcessingError::InvalidImage)?;
        if decoder.total_bytes() > MAX_DECODED_BYTES {
            return Err(ImageProcessingError::InvalidImage);
        }
        decoder
            .orientation()
            .map_err(|_| ImageProcessingError::InvalidImage)?
    };

    let mut image = image_reader(data, format)
        .decode()
        .map_err(|_| ImageProcessingError::InvalidImage)?;
    image.apply_orientation(orientation);

    let (width, height) = image.dimensions();
    if width == 0
        || height == 0
        || width > MAX_IMAGE_DIMENSION
        || height > MAX_IMAGE_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return Err(ImageProcessingError::InvalidImage);
    }

    // Normalize high-bit-depth and palette variants to bounded 8-bit buffers.
    // Re-encoding only pixels deliberately drops EXIF, comments, XMP, and ICC.
    image = if image.color().has_alpha() {
        DynamicImage::ImageRgba8(image.into_rgba8())
    } else {
        DynamicImage::ImageRgb8(image.into_rgb8())
    };

    if purpose == ImagePurpose::Avatar
        && (image.width() > MAX_AVATAR_DIMENSION || image.height() > MAX_AVATAR_DIMENSION)
    {
        image = image.resize(
            MAX_AVATAR_DIMENSION,
            MAX_AVATAR_DIMENSION,
            imageops::FilterType::Lanczos3,
        );
    }

    let mut output = SizeLimitedWriter::new(max_output_bytes);
    let encode_result = match format {
        StoredImageFormat::Jpeg => {
            image.write_with_encoder(JpegEncoder::new_with_quality(&mut output, JPEG_QUALITY))
        }
        StoredImageFormat::Png => image.write_with_encoder(PngEncoder::new_with_quality(
            &mut output,
            CompressionType::Fast,
            FilterType::Adaptive,
        )),
        StoredImageFormat::Webp => image.write_with_encoder(WebPEncoder::new_lossless(&mut output)),
    };

    if output.exceeded_limit {
        return Err(ImageProcessingError::OutputTooLarge);
    }
    encode_result.map_err(|_| ImageProcessingError::InvalidImage)?;

    Ok(ProcessedImage {
        extension: format.canonical_extension(),
        data: output.data,
    })
}

struct SizeLimitedWriter {
    data: Vec<u8>,
    max_bytes: usize,
    exceeded_limit: bool,
}

impl SizeLimitedWriter {
    fn new(max_bytes: usize) -> Self {
        Self {
            data: Vec::new(),
            max_bytes,
            exceeded_limit: false,
        }
    }
}

impl Write for SizeLimitedWriter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        if self.data.len().saturating_add(buffer.len()) > self.max_bytes {
            self.exceeded_limit = true;
            return Err(io::Error::other("encoded image exceeds configured limit"));
        }
        self.data.extend_from_slice(buffer);
        Ok(buffer.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn detect_image(data: &[u8]) -> Option<(StoredImageFormat, u32, u32)> {
    detect_png(data)
        .map(|(width, height)| (StoredImageFormat::Png, width, height))
        .or_else(|| {
            detect_webp(data).map(|(width, height)| (StoredImageFormat::Webp, width, height))
        })
        .or_else(|| {
            detect_jpeg(data).map(|(width, height)| (StoredImageFormat::Jpeg, width, height))
        })
}

fn detect_png(data: &[u8]) -> Option<(u32, u32)> {
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    const PNG_END: &[u8; 12] = b"\0\0\0\0IEND\xaeB`\x82";

    if data.len() < 45
        || data.get(..8)? != PNG_SIGNATURE
        || data.get(12..16)? != b"IHDR"
        || data.get(data.len() - PNG_END.len()..)? != PNG_END
    {
        return None;
    }

    let width = u32::from_be_bytes(data.get(16..20)?.try_into().ok()?);
    let height = u32::from_be_bytes(data.get(20..24)?.try_into().ok()?);
    Some((width, height))
}

fn detect_webp(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 30 || data.get(..4)? != b"RIFF" || data.get(8..12)? != b"WEBP" {
        return None;
    }

    let declared_size = u32::from_le_bytes(data.get(4..8)?.try_into().ok()?) as usize + 8;
    if declared_size != data.len() {
        return None;
    }

    match data.get(12..16)? {
        b"VP8X" => {
            let width = 1 + read_u24_le(data.get(24..27)?);
            let height = 1 + read_u24_le(data.get(27..30)?);
            Some((width, height))
        }
        b"VP8L" if data.get(20) == Some(&0x2f) && data.len() >= 25 => {
            let b1 = u32::from(data[21]);
            let b2 = u32::from(data[22]);
            let b3 = u32::from(data[23]);
            let b4 = u32::from(data[24]);
            let width = 1 + b1 + ((b2 & 0x3f) << 8);
            let height = 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10);
            Some((width, height))
        }
        b"VP8 " if data.get(23..26) == Some(b"\x9d\x01\x2a") && data.len() >= 30 => {
            let width = u32::from(u16::from_le_bytes(data.get(26..28)?.try_into().ok()?) & 0x3fff);
            let height = u32::from(u16::from_le_bytes(data.get(28..30)?.try_into().ok()?) & 0x3fff);
            Some((width, height))
        }
        _ => None,
    }
}

fn read_u24_le(bytes: &[u8]) -> u32 {
    u32::from(bytes[0]) | (u32::from(bytes[1]) << 8) | (u32::from(bytes[2]) << 16)
}

fn detect_jpeg(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 12 || data.get(..3)? != b"\xff\xd8\xff" || !data.ends_with(b"\xff\xd9") {
        return None;
    }

    let mut offset = 2;
    while offset + 4 <= data.len() {
        while data.get(offset) == Some(&0xff) {
            offset += 1;
        }
        let marker = *data.get(offset)?;
        offset += 1;

        if marker == 0xda || marker == 0xd9 {
            break;
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            continue;
        }

        let segment_length = usize::from(u16::from_be_bytes(
            data.get(offset..offset + 2)?.try_into().ok()?,
        ));
        if segment_length < 2 || offset + segment_length > data.len() {
            return None;
        }

        if matches!(
            marker,
            0xc0 | 0xc1
                | 0xc2
                | 0xc3
                | 0xc5
                | 0xc6
                | 0xc7
                | 0xc9
                | 0xca
                | 0xcb
                | 0xcd
                | 0xce
                | 0xcf
        ) {
            if segment_length < 7 {
                return None;
            }
            let height = u32::from(u16::from_be_bytes(
                data.get(offset + 3..offset + 5)?.try_into().ok()?,
            ));
            let width = u32::from(u16::from_be_bytes(
                data.get(offset + 5..offset + 7)?.try_into().ok()?,
            ));
            return Some((width, height));
        }

        offset += segment_length;
    }

    None
}

#[cfg(test)]
mod tests {
    use super::{process_uploaded_image, ImageProcessingError, ImagePurpose, MAX_AVATAR_DIMENSION};
    use axum::body::Bytes;
    use image::{
        codecs::jpeg::JpegEncoder, DynamicImage, GenericImageView, ImageFormat, ImageReader,
    };
    use std::io::Cursor;

    fn encoded_image(format: ImageFormat, width: u32, height: u32) -> Vec<u8> {
        let image = DynamicImage::new_rgba8(width, height);
        let mut data = Vec::new();
        match format {
            ImageFormat::Jpeg => image
                .write_with_encoder(JpegEncoder::new_with_quality(&mut data, 90))
                .unwrap(),
            _ => image.write_to(&mut Cursor::new(&mut data), format).unwrap(),
        }
        data
    }

    #[tokio::test]
    async fn decodes_and_reencodes_supported_images() {
        for (format, filename, media_type, extension) in [
            (ImageFormat::Jpeg, "photo.jpeg", "image/jpeg", "jpg"),
            (ImageFormat::Png, "photo.png", "image/png", "png"),
            (ImageFormat::WebP, "photo.webp", "image/webp", "webp"),
        ] {
            let processed = process_uploaded_image(
                filename,
                Some(media_type),
                Bytes::from(encoded_image(format, 32, 16)),
                ImagePurpose::Post,
                1024 * 1024,
            )
            .await
            .unwrap();

            assert_eq!(processed.extension, extension);
            assert_eq!(
                ImageReader::with_format(Cursor::new(&processed.data), format)
                    .decode()
                    .unwrap()
                    .dimensions(),
                (32, 16)
            );
        }
    }

    #[tokio::test]
    async fn strips_embedded_jpeg_comments() {
        let original = encoded_image(ImageFormat::Jpeg, 32, 16);
        let secret = b"private-location-comment";
        let segment_length = u16::try_from(secret.len() + 2).unwrap();
        let mut with_comment = Vec::from(&original[..2]);
        with_comment.extend_from_slice(&[0xff, 0xfe]);
        with_comment.extend_from_slice(&segment_length.to_be_bytes());
        with_comment.extend_from_slice(secret);
        with_comment.extend_from_slice(&original[2..]);

        let processed = process_uploaded_image(
            "photo.jpg",
            Some("image/jpeg"),
            Bytes::from(with_comment),
            ImagePurpose::Post,
            1024 * 1024,
        )
        .await
        .unwrap();

        assert!(!processed
            .data
            .windows(secret.len())
            .any(|window| window == secret));
    }

    #[tokio::test]
    async fn bounds_avatar_dimensions() {
        let processed = process_uploaded_image(
            "avatar.png",
            Some("image/png"),
            Bytes::from(encoded_image(ImageFormat::Png, 1_400, 700)),
            ImagePurpose::Avatar,
            5 * 1024 * 1024,
        )
        .await
        .unwrap();
        let dimensions = image::load_from_memory_with_format(&processed.data, ImageFormat::Png)
            .unwrap()
            .dimensions();

        assert_eq!(dimensions, (MAX_AVATAR_DIMENSION, 512));
    }

    #[tokio::test]
    async fn rejects_malformed_mismatched_and_oversized_images() {
        let malformed = [
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x10, 0x00, 0x20, 0xff, 0xd9,
        ];
        assert_eq!(
            process_uploaded_image(
                "photo.jpg",
                Some("image/jpeg"),
                Bytes::copy_from_slice(&malformed),
                ImagePurpose::Post,
                1024,
            )
            .await
            .unwrap_err(),
            ImageProcessingError::InvalidImage
        );

        let png = encoded_image(ImageFormat::Png, 16, 16);
        assert_eq!(
            process_uploaded_image(
                "photo.jpg",
                Some("image/png"),
                Bytes::from(png.clone()),
                ImagePurpose::Post,
                1024 * 1024,
            )
            .await
            .unwrap_err(),
            ImageProcessingError::InvalidImage
        );
        assert_eq!(
            process_uploaded_image(
                "photo.png",
                Some("image/jpeg"),
                Bytes::from(png.clone()),
                ImagePurpose::Post,
                1024 * 1024,
            )
            .await
            .unwrap_err(),
            ImageProcessingError::InvalidImage
        );

        let mut oversized = png.clone();
        oversized[16..20].copy_from_slice(&9_000_u32.to_be_bytes());
        assert_eq!(
            process_uploaded_image(
                "photo.png",
                Some("image/png"),
                Bytes::from(oversized),
                ImagePurpose::Post,
                1024 * 1024,
            )
            .await
            .unwrap_err(),
            ImageProcessingError::InvalidImage
        );
        assert_eq!(
            process_uploaded_image(
                "photo.png",
                Some("image/png"),
                Bytes::from(png),
                ImagePurpose::Post,
                1,
            )
            .await
            .unwrap_err(),
            ImageProcessingError::OutputTooLarge
        );
    }
}
