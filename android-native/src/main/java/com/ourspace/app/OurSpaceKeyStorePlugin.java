package com.ourspace.app;

import android.os.Build;
import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECFieldFp;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Locale;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Cryptography boundary for Our Space Phase 2.
 *
 * The ECDH shared secret and AES message key are never returned to JavaScript.
 * On API 31+, the ECDH private key is non-exportable in Android Keystore.
 * On API 23-30, the native process unwraps an AES-GCM-protected PKCS#8 key only for
 * ECDH operations; the wrapping key remains non-exportable in Android Keystore.
 * The latter mode is compatible, but weaker against compromise of the app process.
 */
@CapacitorPlugin(name = "OurSpaceKeyStore")
public final class OurSpaceKeyStorePlugin extends Plugin {
    private static final String ECDH_ALIAS = "our-space.identity.p256.v1";
    private static final String SOFTWARE_IDENTITY_WRAP_ALIAS = "our-space.identity.wrap.aes.v1";
    private static final String SOFTWARE_IDENTITY_PREFS = "our_space_identity_v1";
    private static final String SOFTWARE_PUBLIC_KEY_PREF = "public_x509";
    private static final String SOFTWARE_PRIVATE_NONCE_PREF = "private_nonce";
    private static final String SOFTWARE_PRIVATE_CIPHERTEXT_PREF = "private_ciphertext";
    private static final byte[] IDENTITY_WRAP_AAD = "our-space/device-identity/pkcs8/v1".getBytes(StandardCharsets.UTF_8);
    private static final String SESSION_ALIAS = "our-space.session-storage.aes.v1";
    private static final int KEY_VERSION = 1;
    private static final int ECDH_SECRET_BYTES = 32;
    private static final int MAX_PLAINTEXT_BYTES = 16 * 1024;
    private static final int MAX_MEDIA_BYTES = 3 * 1024 * 1024;
    private static final int MAX_MEDIA_CIPHERTEXT_BASE64_CHARS = 4_300_000;
    private static final int MEDIA_PACKAGE_MAGIC = 0x4F534D31; // "OSM1"
    private static final int GCM_NONCE_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";

    @PluginMethod
    public void createIdentityKey(PluginCall call) {
        try {
            requireEcdhSupport();
            KeyStore keyStore = loadKeyStore();
            if (keyStore.containsAlias(ECDH_ALIAS)) {
                resolveIdentity(call, keyStore);
                return;
            }
            // Preserve API 23-30 identities if Android is later upgraded to API 31+.
            if (hasSoftwareIdentityRecord()) {
                resolveIdentity(call, loadSoftwareIdentityKeyPair().getPublic());
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                KeyPairGenerator generator = KeyPairGenerator.getInstance("EC", ANDROID_KEYSTORE);
                KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                    ECDH_ALIAS,
                    KeyProperties.PURPOSE_AGREE_KEY
                )
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build();
                generator.initialize(spec);
                generator.generateKeyPair();
                resolveIdentity(call, keyStore);
            } else {
                KeyPair pair = getOrCreateSoftwareIdentityKeyPair();
                resolveIdentity(call, pair.getPublic());
            }
        } catch (Exception e) {
            call.reject(identityFailureMessage(e), e);
        }
    }

    @PluginMethod
    public void fingerprintPublicKey(PluginCall call) {
        byte[] encoded = null;
        try {
            requireEcdhSupport();
            PublicKey peerKey = decodeAndValidatePeerKey(requiredString(call, "publicKey"));
            encoded = peerKey.getEncoded();
            JSObject result = new JSObject();
            result.put("fingerprint", hex(MessageDigest.getInstance("SHA-256").digest(encoded)));
            result.put("algorithm", "ECDH-P256");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Public key pasangan tidak valid; fingerprint tidak dapat diverifikasi.", e);
        } finally {
            clear(encoded);
        }
    }

    @PluginMethod
    public void getIdentityKey(PluginCall call) {
        try {
            requireEcdhSupport();
            KeyStore keyStore = loadKeyStore();
            if (keyStore.containsAlias(ECDH_ALIAS)) {
                resolveIdentity(call, keyStore);
            } else if (hasSoftwareIdentityRecord()) {
                resolveIdentity(call, loadSoftwareIdentityKeyPair().getPublic());
            } else {
                call.reject("Kunci identitas belum dibuat pada perangkat ini.");
            }
        } catch (Exception e) {
            call.reject(identityFailureMessage(e), e);
        }
    }

    @PluginMethod
    public void encryptMessage(PluginCall call) {
        byte[] sharedSecret = null;
        byte[] messageKey = null;
        byte[] plainBytes = null;
        try {
            requireEcdhSupport();
            String peerKey = requiredString(call, "peerPublicKey");
            String plaintext = requiredString(call, "plaintext");
            String pairId = requiredUuid(call, "pairId");
            String messageId = requiredUuid(call, "messageId");
            String senderId = requiredUuid(call, "senderId");
            String recipientId = requiredUuid(call, "recipientId");
            int version = readKeyVersion(call);
            String messageType = readMessageType(call);
            requireValidContext(pairId, messageId, senderId, recipientId, version);
            plainBytes = plaintext.getBytes(StandardCharsets.UTF_8);
            if (plainBytes.length == 0 || plainBytes.length > MAX_PLAINTEXT_BYTES) {
                Arrays.fill(plainBytes, (byte) 0);
                call.reject("Pesan kosong atau terlalu panjang.");
                return;
            }

            KeyPair local = loadIdentityKeyPair();
            PublicKey peerPublicKey = decodeAndValidatePeerKey(peerKey);
            sharedSecret = deriveSharedSecret(local.getPrivate(), peerPublicKey);
            messageKey = deriveMessageKey(sharedSecret, pairId, senderId, recipientId, version, messageType);
            byte[] nonce = new byte[GCM_NONCE_BYTES];
            new SecureRandom().nextBytes(nonce);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(messageKey, "AES"), new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(associatedData(pairId, messageId, senderId, recipientId, version, messageType));
            byte[] ciphertext = cipher.doFinal(plainBytes);
            Arrays.fill(plainBytes, (byte) 0);

            JSObject result = new JSObject();
            result.put("nonce", Base64.encodeToString(nonce, Base64.NO_WRAP));
            result.put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
            result.put("algorithm", "ECDH-P256/HKDF-SHA256/AES-256-GCM");
            result.put("keyVersion", version);
            call.resolve(result);
            Arrays.fill(nonce, (byte) 0);
            Arrays.fill(ciphertext, (byte) 0);
        } catch (Exception e) {
            call.reject("Enkripsi pesan gagal. Pesan tidak dikirim.", e);
        } finally {
            clear(sharedSecret);
            clear(messageKey);
            clear(plainBytes);
        }
    }

    @PluginMethod
    public void decryptMessage(PluginCall call) {
        byte[] sharedSecret = null;
        byte[] messageKey = null;
        byte[] plaintext = null;
        try {
            requireEcdhSupport();
            String peerKey = requiredString(call, "peerPublicKey");
            String ciphertextText = requiredString(call, "ciphertext");
            String nonceText = requiredString(call, "nonce");
            String pairId = requiredUuid(call, "pairId");
            String messageId = requiredUuid(call, "messageId");
            String senderId = requiredUuid(call, "senderId");
            String recipientId = requiredUuid(call, "recipientId");
            int version = readKeyVersion(call);
            String messageType = readMessageType(call);
            requireValidContext(pairId, messageId, senderId, recipientId, version);

            byte[] nonce = Base64.decode(nonceText, Base64.DEFAULT);
            byte[] ciphertext = Base64.decode(ciphertextText, Base64.DEFAULT);
            if (nonce.length != GCM_NONCE_BYTES || ciphertext.length < 16 || ciphertext.length > MAX_PLAINTEXT_BYTES + 16) {
                call.reject("Format ciphertext tidak valid.");
                return;
            }

            KeyPair local = loadIdentityKeyPair();
            PublicKey peerPublicKey = decodeAndValidatePeerKey(peerKey);
            sharedSecret = deriveSharedSecret(local.getPrivate(), peerPublicKey);
            messageKey = deriveMessageKey(sharedSecret, pairId, senderId, recipientId, version, messageType);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(messageKey, "AES"), new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(associatedData(pairId, messageId, senderId, recipientId, version, messageType));
            plaintext = cipher.doFinal(ciphertext); // GCM authentication must succeed before plaintext is returned.

            JSObject result = new JSObject();
            result.put("plaintext", new String(plaintext, StandardCharsets.UTF_8));
            call.resolve(result);
            clear(nonce);
            clear(ciphertext);
        } catch (Exception e) {
            call.reject("Dekripsi gagal atau metadata pesan tidak cocok. Isi pesan tidak ditampilkan.", e);
        } finally {
            clear(sharedSecret);
            clear(messageKey);
            clear(plaintext);
        }
    }

    @PluginMethod
    public void encryptMedia(PluginCall call) {
        byte[] mediaBytes = null;
        byte[] filenameBytes = null;
        byte[] mimeBytes = null;
        byte[] packedPlaintext = null;
        byte[] sharedSecret = null;
        byte[] messageKey = null;
        byte[] nonce = null;
        byte[] ciphertext = null;
        try {
            requireEcdhSupport();
            String peerKey = requiredString(call, "peerPublicKey");
            String mediaBase64 = requiredString(call, "mediaBase64");
            String filename = requiredString(call, "filename");
            String mimeType = normalizeMediaMimeType(requiredString(call, "mimeType"));
            String pairId = requiredUuid(call, "pairId");
            String messageId = requiredUuid(call, "messageId");
            String senderId = requiredUuid(call, "senderId");
            String recipientId = requiredUuid(call, "recipientId");
            int version = readKeyVersion(call);
            requireValidContext(pairId, messageId, senderId, recipientId, version);

            if (!isAllowedMediaMimeType(mimeType)) {
                call.reject("Jenis media tidak didukung. Gunakan gambar, video, atau audio umum.");
                return;
            }
            if (mediaBase64.length() > ((MAX_MEDIA_BYTES + 2) / 3 * 4) + 8) {
                call.reject("Media maksimal 3 MiB agar pemrosesan aman di HP.");
                return;
            }

            mediaBytes = Base64.decode(mediaBase64, Base64.DEFAULT);
            filenameBytes = filename.getBytes(StandardCharsets.UTF_8);
            mimeBytes = mimeType.getBytes(StandardCharsets.UTF_8);
            if (mediaBytes.length == 0 || mediaBytes.length > MAX_MEDIA_BYTES) {
                call.reject("Media kosong atau melebihi batas 3 MiB.");
                return;
            }
            if (filenameBytes.length == 0 || filenameBytes.length > 512 || mimeBytes.length == 0 || mimeBytes.length > 128) {
                call.reject("Metadata media tidak valid.");
                return;
            }

            ByteArrayOutputStream buffer = new ByteArrayOutputStream(12 + filenameBytes.length + mimeBytes.length + mediaBytes.length);
            try (DataOutputStream output = new DataOutputStream(buffer)) {
                output.writeInt(MEDIA_PACKAGE_MAGIC);
                output.writeShort(filenameBytes.length);
                output.writeShort(mimeBytes.length);
                output.writeInt(mediaBytes.length);
                output.write(filenameBytes);
                output.write(mimeBytes);
                output.write(mediaBytes);
                output.flush();
                packedPlaintext = buffer.toByteArray();
            }

            KeyPair local = loadIdentityKeyPair();
            PublicKey peerPublicKey = decodeAndValidatePeerKey(peerKey);
            sharedSecret = deriveSharedSecret(local.getPrivate(), peerPublicKey);
            messageKey = deriveMessageKey(sharedSecret, pairId, senderId, recipientId, version, "media/blob");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(messageKey, "AES"));
            nonce = cipher.getIV();
            cipher.updateAAD(associatedData(pairId, messageId, senderId, recipientId, version, "media/blob"));
            ciphertext = cipher.doFinal(packedPlaintext);

            JSObject result = new JSObject();
            result.put("nonce", Base64.encodeToString(nonce, Base64.NO_WRAP));
            result.put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
            result.put("algorithm", "ECDH-P256/HKDF-SHA256/AES-256-GCM");
            result.put("mediaVersion", 1);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Enkripsi media gagal. File tidak dikirim dalam bentuk asli.", e);
        } finally {
            clear(mediaBytes);
            clear(filenameBytes);
            clear(mimeBytes);
            clear(packedPlaintext);
            clear(sharedSecret);
            clear(messageKey);
            clear(nonce);
            clear(ciphertext);
        }
    }

    @PluginMethod
    public void decryptMedia(PluginCall call) {
        byte[] sharedSecret = null;
        byte[] messageKey = null;
        byte[] nonce = null;
        byte[] ciphertext = null;
        byte[] packedPlaintext = null;
        byte[] filenameBytes = null;
        byte[] mimeBytes = null;
        byte[] mediaBytes = null;
        try {
            requireEcdhSupport();
            String peerKey = requiredString(call, "peerPublicKey");
            String ciphertextText = requiredString(call, "ciphertext");
            String nonceText = requiredString(call, "nonce");
            String pairId = requiredUuid(call, "pairId");
            String messageId = requiredUuid(call, "messageId");
            String senderId = requiredUuid(call, "senderId");
            String recipientId = requiredUuid(call, "recipientId");
            int version = readKeyVersion(call);
            requireValidContext(pairId, messageId, senderId, recipientId, version);

            if (ciphertextText.length() > MAX_MEDIA_CIPHERTEXT_BASE64_CHARS) {
                call.reject("Ukuran lampiran terenkripsi tidak valid.");
                return;
            }
            nonce = Base64.decode(nonceText, Base64.DEFAULT);
            ciphertext = Base64.decode(ciphertextText, Base64.DEFAULT);
            if (nonce.length != GCM_NONCE_BYTES || ciphertext.length < 28 || ciphertext.length > MAX_MEDIA_BYTES + 1024) {
                call.reject("Format lampiran terenkripsi tidak valid.");
                return;
            }

            KeyPair local = loadIdentityKeyPair();
            PublicKey peerPublicKey = decodeAndValidatePeerKey(peerKey);
            sharedSecret = deriveSharedSecret(local.getPrivate(), peerPublicKey);
            messageKey = deriveMessageKey(sharedSecret, pairId, senderId, recipientId, version, "media/blob");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(messageKey, "AES"), new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(associatedData(pairId, messageId, senderId, recipientId, version, "media/blob"));
            packedPlaintext = cipher.doFinal(ciphertext);

            try (DataInputStream input = new DataInputStream(new ByteArrayInputStream(packedPlaintext))) {
                if (input.readInt() != MEDIA_PACKAGE_MAGIC) {
                    throw new GeneralSecurityException("Media envelope version is not supported.");
                }
                int filenameLength = input.readUnsignedShort();
                int mimeLength = input.readUnsignedShort();
                int mediaLength = input.readInt();
                if (filenameLength < 1 || filenameLength > 512 || mimeLength < 1 || mimeLength > 128
                    || mediaLength < 1 || mediaLength > MAX_MEDIA_BYTES
                    || (long) filenameLength + mimeLength + mediaLength != input.available()) {
                    throw new GeneralSecurityException("Media envelope lengths are invalid.");
                }
                filenameBytes = new byte[filenameLength];
                mimeBytes = new byte[mimeLength];
                mediaBytes = new byte[mediaLength];
                input.readFully(filenameBytes);
                input.readFully(mimeBytes);
                input.readFully(mediaBytes);
            }

            String filename = new String(filenameBytes, StandardCharsets.UTF_8);
            String mimeType = normalizeMediaMimeType(new String(mimeBytes, StandardCharsets.UTF_8));
            if (!isAllowedMediaMimeType(mimeType)) {
                throw new GeneralSecurityException("Decrypted media type is not allowed.");
            }

            JSObject result = new JSObject();
            result.put("filename", filename);
            result.put("mimeType", mimeType);
            result.put("size", mediaBytes.length);
            result.put("mediaBase64", Base64.encodeToString(mediaBytes, Base64.NO_WRAP));
            result.put("mediaVersion", 1);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Lampiran tidak dapat diverifikasi atau didekripsi. Isi tidak ditampilkan.", e);
        } finally {
            clear(sharedSecret);
            clear(messageKey);
            clear(nonce);
            clear(ciphertext);
            clear(packedPlaintext);
            clear(filenameBytes);
            clear(mimeBytes);
            clear(mediaBytes);
        }
    }

    @PluginMethod
    public void sealSessionValue(PluginCall call) {
        byte[] plaintext = null;
        byte[] ciphertext = null;
        try {
            String value = requiredString(call, "value");
            plaintext = value.getBytes(StandardCharsets.UTF_8);
            if (plaintext.length > 64 * 1024) {
                call.reject("Data sesi terlalu besar.");
                return;
            }
            SecretKey key = getOrCreateSessionKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            ciphertext = cipher.doFinal(plaintext);
            JSObject result = new JSObject();
            result.put("nonce", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
            result.put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Penyimpanan sesi terenkripsi gagal.", e);
        } finally {
            clear(plaintext);
            clear(ciphertext);
        }
    }

    @PluginMethod
    public void openSessionValue(PluginCall call) {
        byte[] plaintext = null;
        try {
            String nonceText = requiredString(call, "nonce");
            String ciphertextText = requiredString(call, "ciphertext");
            byte[] nonce = Base64.decode(nonceText, Base64.DEFAULT);
            byte[] ciphertext = Base64.decode(ciphertextText, Base64.DEFAULT);
            if (nonce.length != GCM_NONCE_BYTES || ciphertext.length > 64 * 1024 + 16) {
                call.reject("Format penyimpanan sesi tidak valid.");
                return;
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSessionKey(), new GCMParameterSpec(GCM_TAG_BITS, nonce));
            plaintext = cipher.doFinal(ciphertext);
            JSObject result = new JSObject();
            result.put("value", new String(plaintext, StandardCharsets.UTF_8));
            call.resolve(result);
            clear(nonce);
            clear(ciphertext);
        } catch (Exception e) {
            call.reject("Sesi tersimpan tidak dapat dibuka di perangkat ini.", e);
        } finally {
            clear(plaintext);
        }
    }

    private void resolveIdentity(PluginCall call, KeyStore keyStore) throws Exception {
        java.security.cert.Certificate certificate = keyStore.getCertificate(ECDH_ALIAS);
        if (certificate == null || certificate.getPublicKey() == null) {
            throw new GeneralSecurityException("Android Keystore contains an incomplete identity entry.");
        }
        resolveIdentity(call, certificate.getPublicKey());
    }

    private void resolveIdentity(PluginCall call, PublicKey publicKey) throws Exception {
        byte[] encoded = publicKey.getEncoded();
        try {
            JSObject result = new JSObject();
            result.put("publicKey", Base64.encodeToString(encoded, Base64.NO_WRAP));
            result.put("fingerprint", hex(MessageDigest.getInstance("SHA-256").digest(encoded)));
            result.put("keyVersion", KEY_VERSION);
            result.put("algorithm", "ECDH-P256");
            call.resolve(result);
        } finally {
            clear(encoded);
        }
    }

    private KeyPair loadIdentityKeyPair() throws Exception {
        KeyStore keyStore = loadKeyStore();
        if (keyStore.containsAlias(ECDH_ALIAS)) {
            PrivateKey privateKey = (PrivateKey) keyStore.getKey(ECDH_ALIAS, null);
            java.security.cert.Certificate certificate = keyStore.getCertificate(ECDH_ALIAS);
            PublicKey publicKey = certificate == null ? null : certificate.getPublicKey();
            if (privateKey == null || publicKey == null) {
                throw new GeneralSecurityException("Identity key is incomplete.");
            }
            return new KeyPair(publicKey, privateKey);
        }
        if (hasSoftwareIdentityRecord()) return loadSoftwareIdentityKeyPair();
        throw new GeneralSecurityException("Identity key not initialized.");
    }

    private SharedPreferences softwareIdentityPreferences() {
        return getContext().getSharedPreferences(SOFTWARE_IDENTITY_PREFS, Context.MODE_PRIVATE);
    }

    private boolean hasSoftwareIdentityRecord() {
        SharedPreferences prefs = softwareIdentityPreferences();
        return prefs.contains(SOFTWARE_PUBLIC_KEY_PREF)
            || prefs.contains(SOFTWARE_PRIVATE_NONCE_PREF)
            || prefs.contains(SOFTWARE_PRIVATE_CIPHERTEXT_PREF);
    }

    /**
     * API 23-30 does not expose PURPOSE_AGREE_KEY. This fallback generates P-256 in
     * native code, wraps its PKCS#8 private-key bytes with an AES-GCM key held in
     * Android Keystore, and persists only the authenticated ciphertext. The private
     * key is software-backed and briefly present in native process memory for ECDH;
     * it is never returned to JavaScript or stored plaintext.
     */
    private synchronized KeyPair getOrCreateSoftwareIdentityKeyPair() throws Exception {
        if (hasSoftwareIdentityRecord()) return loadSoftwareIdentityKeyPair();

        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair generated = generator.generateKeyPair();
        byte[] privateBytes = generated.getPrivate().getEncoded();
        byte[] nonce = null;
        byte[] encryptedPrivate = null;
        try {
            if (privateBytes == null || privateBytes.length == 0) {
                throw new GeneralSecurityException("The EC provider did not export PKCS#8 bytes.");
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateIdentityWrappingKey());
            cipher.updateAAD(IDENTITY_WRAP_AAD);
            nonce = cipher.getIV();
            encryptedPrivate = cipher.doFinal(privateBytes);

            boolean saved = softwareIdentityPreferences().edit()
                .putString(SOFTWARE_PUBLIC_KEY_PREF, Base64.encodeToString(generated.getPublic().getEncoded(), Base64.NO_WRAP))
                .putString(SOFTWARE_PRIVATE_NONCE_PREF, Base64.encodeToString(nonce, Base64.NO_WRAP))
                .putString(SOFTWARE_PRIVATE_CIPHERTEXT_PREF, Base64.encodeToString(encryptedPrivate, Base64.NO_WRAP))
                .commit();
            if (!saved) throw new GeneralSecurityException("Wrapped identity key could not be persisted.");
            return generated;
        } finally {
            clear(privateBytes);
            clear(nonce);
            clear(encryptedPrivate);
        }
    }

    private KeyPair loadSoftwareIdentityKeyPair() throws Exception {
        SharedPreferences prefs = softwareIdentityPreferences();
        String publicText = prefs.getString(SOFTWARE_PUBLIC_KEY_PREF, null);
        String nonceText = prefs.getString(SOFTWARE_PRIVATE_NONCE_PREF, null);
        String ciphertextText = prefs.getString(SOFTWARE_PRIVATE_CIPHERTEXT_PREF, null);
        if (publicText == null || nonceText == null || ciphertextText == null) {
            throw new GeneralSecurityException("Wrapped identity key record is incomplete; refusing automatic key rotation.");
        }

        KeyStore keyStore = loadKeyStore();
        if (!keyStore.containsAlias(SOFTWARE_IDENTITY_WRAP_ALIAS)) {
            throw new GeneralSecurityException("Identity wrapping key is missing; refusing automatic replacement.");
        }
        SecretKey wrappingKey = (SecretKey) keyStore.getKey(SOFTWARE_IDENTITY_WRAP_ALIAS, null);
        if (wrappingKey == null) throw new GeneralSecurityException("Identity wrapping key is unavailable.");

        byte[] nonce = null;
        byte[] encryptedPrivate = null;
        byte[] privateBytes = null;
        try {
            nonce = Base64.decode(nonceText, Base64.DEFAULT);
            encryptedPrivate = Base64.decode(ciphertextText, Base64.DEFAULT);
            if (nonce.length != GCM_NONCE_BYTES || encryptedPrivate.length < 16 || encryptedPrivate.length > 4096) {
                throw new GeneralSecurityException("Wrapped identity key data has an invalid format.");
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, wrappingKey, new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(IDENTITY_WRAP_AAD);
            privateBytes = cipher.doFinal(encryptedPrivate);
            PrivateKey privateKey = KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(privateBytes));
            PublicKey publicKey = decodeAndValidatePeerKey(publicText);
            verifySoftwareIdentityPair(privateKey, publicKey);
            return new KeyPair(publicKey, privateKey);
        } finally {
            clear(nonce);
            clear(encryptedPrivate);
            clear(privateBytes);
        }
    }

    private static void verifySoftwareIdentityPair(PrivateKey privateKey, PublicKey publicKey) throws GeneralSecurityException {
        byte[] challenge = "our-space/identity-key-pair-check/v1".getBytes(StandardCharsets.UTF_8);
        byte[] signatureBytes = null;
        try {
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(privateKey);
            signer.update(challenge);
            signatureBytes = signer.sign();
            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(publicKey);
            verifier.update(challenge);
            if (!verifier.verify(signatureBytes)) {
                throw new GeneralSecurityException("Stored public and private identity keys do not match.");
            }
        } finally {
            clear(challenge);
            clear(signatureBytes);
        }
    }

    private static SecretKey getOrCreateIdentityWrappingKey() throws GeneralSecurityException, IOException {
        KeyStore keyStore = loadKeyStore();
        if (keyStore.containsAlias(SOFTWARE_IDENTITY_WRAP_ALIAS)) {
            SecretKey existing = (SecretKey) keyStore.getKey(SOFTWARE_IDENTITY_WRAP_ALIAS, null);
            if (existing != null) return existing;
            throw new GeneralSecurityException("Identity wrapping key is unavailable.");
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
            SOFTWARE_IDENTITY_WRAP_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .setUserAuthenticationRequired(false)
            .build();
        generator.init(spec);
        return generator.generateKey();
    }

    private static KeyStore loadKeyStore() throws GeneralSecurityException, IOException {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        return keyStore;
    }

    private static SecretKey getOrCreateSessionKey() throws GeneralSecurityException, IOException {
        KeyStore keyStore = loadKeyStore();
        if (keyStore.containsAlias(SESSION_ALIAS)) {
            return (SecretKey) keyStore.getKey(SESSION_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
            SESSION_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .setUserAuthenticationRequired(false)
            .build();
        generator.init(spec);
        return generator.generateKey();
    }

    private static PublicKey decodeAndValidatePeerKey(String encodedKey) throws GeneralSecurityException {
        if (encodedKey.length() > 2048) {
            throw new GeneralSecurityException("Peer key is too large.");
        }
        byte[] bytes = Base64.decode(encodedKey, Base64.DEFAULT);
        PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(bytes));
        clear(bytes);
        if (!(key instanceof ECPublicKey)) {
            throw new GeneralSecurityException("Peer key is not an EC key.");
        }
        ECParameterSpec actual = ((ECPublicKey) key).getParams();
        java.security.AlgorithmParameters namedCurve = java.security.AlgorithmParameters.getInstance("EC");
        namedCurve.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec expected = namedCurve.getParameterSpec(ECParameterSpec.class);
        if (!(actual.getCurve().getField() instanceof ECFieldFp)
            || !actual.getCurve().equals(expected.getCurve())
            || !actual.getGenerator().equals(expected.getGenerator())
            || !actual.getOrder().equals(expected.getOrder())
            || actual.getCofactor() != expected.getCofactor()) {
            throw new GeneralSecurityException("Peer key is not a P-256 key.");
        }
        return key;
    }

    private static byte[] deriveSharedSecret(PrivateKey privateKey, PublicKey peerPublicKey) throws GeneralSecurityException {
        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(privateKey);
        agreement.doPhase(peerPublicKey, true);
        byte[] rawSecret = agreement.generateSecret();
        try {
            // ECDH implementations can differ in whether they retain leading zero bytes.
            // P-256's shared x-coordinate is always represented as exactly 32 bytes before HKDF.
            if (rawSecret.length == 0 || rawSecret.length > ECDH_SECRET_BYTES) {
                throw new GeneralSecurityException("ECDH provider returned an invalid P-256 secret length.");
            }
            byte[] normalized = new byte[ECDH_SECRET_BYTES];
            System.arraycopy(rawSecret, 0, normalized, ECDH_SECRET_BYTES - rawSecret.length, rawSecret.length);
            return normalized;
        } finally {
            clear(rawSecret);
        }
    }

    private static byte[] deriveMessageKey(byte[] sharedSecret, String pairId, String senderId, String recipientId, int keyVersion, String contentType) throws GeneralSecurityException {
        byte[] salt = MessageDigest.getInstance("SHA-256").digest(
            ("our-space/e2ee/salt/v1/" + pairId + "/" + keyVersion).getBytes(StandardCharsets.UTF_8)
        );
        // Separate directional keys by content type; text, media metadata, and media blobs never share AES keys.
        byte[] info = ("our-space/e2ee/" + contentType + "/aes-256-gcm/v1/" + pairId + "/" + senderId + "/" + recipientId + "/" + keyVersion).getBytes(StandardCharsets.UTF_8);
        byte[] prk = hmacSha256(salt, sharedSecret);
        byte[] blockInput = Arrays.copyOf(info, info.length + 1);
        blockInput[blockInput.length - 1] = 1;
        byte[] output = hmacSha256(prk, blockInput);
        clear(salt);
        clear(info);
        clear(prk);
        clear(blockInput);
        byte[] derived = Arrays.copyOf(output, 32);
        clear(output);
        return derived;
    }

    private static byte[] hmacSha256(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private static byte[] associatedData(String pairId, String messageId, String senderId, String recipientId, int keyVersion, String contentType) {
        String value = "our-space/e2ee/v1\n"
            + pairId + "\n"
            + messageId + "\n"
            + senderId + "\n"
            + recipientId + "\n"
            + keyVersion + "\n" + contentType;
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private static String readMessageType(PluginCall call) {
        String value = call.getString("messageType");
        if (value == null || value.trim().isEmpty()) return "text";
        if (!"text".equals(value) && !"media".equals(value)) {
            throw new IllegalArgumentException("Unsupported message content type.");
        }
        return value;
    }

    private static String normalizeMediaMimeType(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isAllowedMediaMimeType(String mimeType) {
        return "image/jpeg".equals(mimeType)
            || "image/png".equals(mimeType)
            || "image/webp".equals(mimeType)
            || "image/gif".equals(mimeType)
            || "image/heic".equals(mimeType)
            || "image/heif".equals(mimeType)
            || "video/mp4".equals(mimeType)
            || "video/webm".equals(mimeType)
            || "video/3gpp".equals(mimeType)
            || "audio/mp4".equals(mimeType)
            || "audio/aac".equals(mimeType)
            || "audio/mpeg".equals(mimeType)
            || "audio/ogg".equals(mimeType)
            || "audio/webm".equals(mimeType)
            || "audio/wav".equals(mimeType)
            || "audio/x-wav".equals(mimeType)
            || "audio/3gpp".equals(mimeType)
            || "audio/amr".equals(mimeType);
    }

    private static String requiredString(PluginCall call, String name) {
        String value = call.getString(name);
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("Missing required field: " + name);
        }
        return value;
    }

    private static String requiredUuid(PluginCall call, String name) {
        String value = requiredString(call, name);
        if (!value.matches("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) {
            throw new IllegalArgumentException("Invalid UUID field: " + name);
        }
        return value.toLowerCase(Locale.ROOT);
    }

    private static int readKeyVersion(PluginCall call) {
        Integer version = call.getInt("keyVersion");
        if (version == null) version = KEY_VERSION;
        if (version != KEY_VERSION) {
            throw new IllegalArgumentException("Unsupported key version.");
        }
        return version;
    }

    private static void requireValidContext(String pairId, String messageId, String senderId, String recipientId, int version) {
        if (senderId.equals(recipientId) || version != KEY_VERSION) {
            throw new IllegalArgumentException("Invalid message context.");
        }
    }

    private static void requireEcdhSupport() throws GeneralSecurityException {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            throw new GeneralSecurityException("E2EE memerlukan Android 6 / API 23 atau lebih baru.");
        }
    }

    private static String identityFailureMessage(Exception error) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return "Chat E2EE memerlukan Android 6 / API 23 atau lebih baru. Perangkat ini menjalankan Android "
                + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ").";
        }
        String type = error == null ? "UnknownError" : error.getClass().getSimpleName();
        String detail = error == null ? "" : error.getMessage();
        if (detail != null) {
            detail = detail.replaceAll("[\\r\\n\\p{Cntrl}]", " ").trim();
            if (detail.length() > 120) detail = detail.substring(0, 120);
        }
        String message = "Kunci identitas gagal dibuat pada Android API " + Build.VERSION.SDK_INT + " (" + type;
        if (detail != null && !detail.isEmpty()) message += ": " + detail;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return message + "). Kunci ECDH Android 11 dilindungi dengan AES-GCM dari Android Keystore; periksa ruang penyimpanan dan coba ulang.";
        }
        return message + "). Coba perbarui sistem, lalu tekan Periksa ulang status.";
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) out.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return out.toString();
    }

    private static void clear(byte[] bytes) {
        if (bytes != null) Arrays.fill(bytes, (byte) 0);
    }
}
