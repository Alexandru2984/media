const MAX_IMAGE_DIMENSION: u32 = 8_192;
const MAX_IMAGE_PIXELS: u64 = 40_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ImageFormat {
    Jpeg,
    Png,
    Webp,
}

impl ImageFormat {
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
}

pub fn validated_image_extension(
    filename: &str,
    content_type: Option<&str>,
    data: &[u8],
) -> Option<&'static str> {
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

    Some(format.canonical_extension())
}

fn detect_image(data: &[u8]) -> Option<(ImageFormat, u32, u32)> {
    detect_png(data)
        .map(|(width, height)| (ImageFormat::Png, width, height))
        .or_else(|| detect_webp(data).map(|(width, height)| (ImageFormat::Webp, width, height)))
        .or_else(|| detect_jpeg(data).map(|(width, height)| (ImageFormat::Jpeg, width, height)))
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
    use super::validated_image_extension;

    #[test]
    fn accepts_matching_jpeg_metadata() {
        let jpeg = [
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x10, 0x00, 0x20, 0xff, 0xd9,
        ];
        assert_eq!(
            validated_image_extension("photo.jpeg", Some("image/jpeg"), &jpeg),
            Some("jpg")
        );
    }

    #[test]
    fn rejects_extension_and_content_mismatches() {
        let mut png = Vec::from(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".as_slice());
        png.extend_from_slice(&32_u32.to_be_bytes());
        png.extend_from_slice(&16_u32.to_be_bytes());
        png.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0]);
        png.extend_from_slice(b"\0\0\0\0IEND\xaeB`\x82");

        assert_eq!(
            validated_image_extension("photo.jpg", Some("image/png"), &png),
            None
        );
        assert_eq!(
            validated_image_extension("photo.png", Some("image/jpeg"), &png),
            None
        );
    }

    #[test]
    fn rejects_oversized_dimensions_and_gif() {
        let jpeg = [
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x23, 0x28, 0x00, 0x20, 0xff, 0xd9,
        ];
        assert_eq!(
            validated_image_extension("photo.jpg", Some("image/jpeg"), &jpeg),
            None
        );
        assert_eq!(
            validated_image_extension("animation.gif", Some("image/gif"), b"GIF89a"),
            None
        );
    }
}
