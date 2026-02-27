import { Jimp } from 'jimp';
import QrCode from 'qrcode-reader';

function isLikelyNoQrError(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    return (
        msg.includes('finder patterns') ||
        msg.includes('not enough finder patterns') ||
        msg.includes("couldn't find enough finder patterns") ||
        msg.includes('not a valid qr')
    );
}

function decodeBitmap(bitmap) {
    return new Promise((resolve, reject) => {
        const qr = new QrCode();
        qr.callback = (err, value) => {
            if (err) return reject(err);
            if (!value || !value.result) return resolve(null);
            resolve(value.result);
        };

        try {
            qr.decode(bitmap);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Decode a QR code from an image buffer.
 * Returns the raw decoded string (e.g. "upi://pay?...") or null if not found.
 */
export async function decodeQrFromBuffer(buffer) {
    if (!buffer) {
        throw new Error('No image buffer provided');
    }

    const image = await Jimp.read(buffer);

    const variants = [];
    variants.push(image);

    if (typeof image.clone === 'function') {
        // Try a centered crop (helps when QR is inside a larger poster/screenshot)
        try {
            const w = image.bitmap.width;
            const h = image.bitmap.height;
            const min = Math.min(w, h);
            const size = Math.max(200, Math.floor(min * 0.85));
            const x = Math.max(0, Math.floor((w - size) / 2));
            const y = Math.max(0, Math.floor((h - size) / 2));
            const cropped = image.clone();
            if (typeof cropped.crop === 'function') {
                cropped.crop(x, y, size, size);
                variants.push(cropped);
            }
        } catch {
            // ignore
        }

        // Try high-contrast grayscale variant
        try {
            const v = image.clone();
            if (typeof v.greyscale === 'function') v.greyscale();
            if (typeof v.contrast === 'function') v.contrast(1);
            variants.push(v);
        } catch {
            // ignore
        }

        // Crop + grayscale + contrast
        try {
            const w = image.bitmap.width;
            const h = image.bitmap.height;
            const min = Math.min(w, h);
            const size = Math.max(200, Math.floor(min * 0.85));
            const x = Math.max(0, Math.floor((w - size) / 2));
            const y = Math.max(0, Math.floor((h - size) / 2));
            const v = image.clone();
            if (typeof v.crop === 'function') v.crop(x, y, size, size);
            if (typeof v.greyscale === 'function') v.greyscale();
            if (typeof v.contrast === 'function') v.contrast(1);
            variants.push(v);
        } catch {
            // ignore
        }
    }

    for (const variant of variants) {
        try {
            const result = await decodeBitmap(variant.bitmap);
            if (result) return result;
        } catch (error) {
            if (isLikelyNoQrError(error)) {
                continue;
            }
            // Unexpected decode error
            throw error;
        }
    }

    return null;
}

export default { decodeQrFromBuffer };

