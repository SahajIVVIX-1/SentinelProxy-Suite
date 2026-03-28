const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const { PATHS, CA_PASSPHRASE } = require('./config');
const db = require('./database');

let caCert, caKey;
const certCache = new Map();

function initCA() {
    const caCandidates = [
        { cert: 'ChakhdiCA.crt', key: 'ChakhdiCA.key' },
        { cert: 'Server.Chakhdi.local.crt', key: 'Server.Chakhdi.local.key' }
    ];
    let caCertPath = path.join(PATHS.ROOT_CA_DIR, caCandidates[0].cert);
    let caKeyPath = path.join(PATHS.ROOT_CA_DIR, caCandidates[0].key);

    for (const candidate of caCandidates) {
        const certPath = path.join(PATHS.ROOT_CA_DIR, candidate.cert);
        const keyPath = path.join(PATHS.ROOT_CA_DIR, candidate.key);
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            caCertPath = certPath;
            caKeyPath = keyPath;
            break;
        }
    }

    try {
        const caCertExists = fs.existsSync(caCertPath);
        const caKeyExists = fs.existsSync(caKeyPath);

        if (!caCertExists || !caKeyExists) {
            throw new Error('CA_MISSING');
        }

        const caCertPem = fs.readFileSync(caCertPath, 'utf8');
        const caKeyPem = fs.readFileSync(caKeyPath, 'utf8');

        caCert = forge.pki.certificateFromPem(caCertPem);

        console.log('🔐 Attempting to decrypt CA private key...');
        console.log(`📝 Key format detected: ${caKeyPem.includes('BEGIN ENCRYPTED PRIVATE KEY') ? 'PKCS#8 Encrypted' : caKeyPem.includes('BEGIN RSA PRIVATE KEY') ? 'RSA' : 'Unknown'}`);

        // Try different methods to load the private key
        try {
            // First try: PKCS#8 encrypted private key
            if (caKeyPem.includes('BEGIN ENCRYPTED PRIVATE KEY')) {
                const encryptedKey = forge.pki.encryptedPrivateKeyFromPem(caKeyPem);
                caKey = forge.pki.decryptPrivateKeyInfo(encryptedKey, CA_PASSPHRASE);
            }
            // Second try: Traditional RSA encrypted private key
            else if (caKeyPem.includes('BEGIN RSA PRIVATE KEY') && caKeyPem.includes('ENCRYPTED')) {
                caKey = forge.pki.decryptRsaPrivateKey(caKeyPem, CA_PASSPHRASE);
            }
            // Third try: Unencrypted private key
            else {
                caKey = forge.pki.privateKeyFromPem(caKeyPem);
            }
        } catch (decryptErr) {
            console.warn('⚠️  Failed to decrypt existing CA key:', decryptErr.message);
            console.warn('🔄 Generating new CA certificate and key...');
            caKey = null;
        }

        if (!caKey) {
            // Generate new CA certificate and key
            console.log('🔑 Generating new CA certificate (this may take a moment)...');
            const keys = forge.pki.rsa.generateKeyPair(2048);
            caKey = keys.privateKey;

            caCert = forge.pki.createCertificate();
            caCert.publicKey = keys.publicKey;
            caCert.serialNumber = '01';
            caCert.validity.notBefore = new Date();
            caCert.validity.notAfter = new Date();
            caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10);

            const attrs = [
                { name: 'commonName', value: 'server.chakhdi.local' },
                { name: 'countryName', value: 'IN' },
                { name: 'stateOrProvinceName', value: 'Chakhdi' },
                { name: 'localityName', value: 'Chakhdi' },
                { name: 'organizationName', value: 'Chakhdi Proxy' },
                { shortName: 'OU', value: 'Chakhdi.local' }
            ];

            caCert.setSubject(attrs);
            caCert.setIssuer(attrs);
            caCert.setExtensions([{
                name: 'basicConstraints',
                cA: true
            }, {
                name: 'keyUsage',
                keyCertSign: true,
                digitalSignature: true,
                cRLSign: true
            }]);

            caCert.sign(caKey, forge.md.sha256.create());

            // Save new CA certificate and key
            const newCaCertPem = forge.pki.certificateToPem(caCert);
            const newCaKeyPem = forge.pki.privateKeyToPem(caKey);

            fs.writeFileSync(caCertPath, newCaCertPem);
            fs.writeFileSync(caKeyPath, newCaKeyPem);

            console.log('✅ New CA certificate and key generated and saved');
            console.log('⚠️  IMPORTANT: Re-install the CA certificate to trust HTTPS sites');
            console.log(`   Certificate location: ${caCertPath}`);
        }

        console.log('✅ CA Certificate and Key loaded successfully');
    } catch (err) {
        if (err.message !== 'CA_MISSING') {
            console.warn('⚠️  CA load failed, regenerating CA:', err.message);
        }

        try {
            // Generate new CA certificate and key
            console.log('🔑 Generating new CA certificate (this may take a moment)...');
            const keys = forge.pki.rsa.generateKeyPair(2048);
            caKey = keys.privateKey;

            caCert = forge.pki.createCertificate();
            caCert.publicKey = keys.publicKey;
            caCert.serialNumber = '01';
            caCert.validity.notBefore = new Date();
            caCert.validity.notAfter = new Date();
            caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10);

            const attrs = [
                { name: 'commonName', value: 'server.chakhdi.local' },
                { name: 'countryName', value: 'IN' },
                { name: 'stateOrProvinceName', value: 'Chakhdi' },
                { name: 'localityName', value: 'Chakhdi' },
                { name: 'organizationName', value: 'Chakhdi Proxy' },
                { shortName: 'OU', value: 'Chakhdi.local' }
            ];

            caCert.setSubject(attrs);
            caCert.setIssuer(attrs);
            caCert.setExtensions([{
                name: 'basicConstraints',
                cA: true
            }, {
                name: 'keyUsage',
                keyCertSign: true,
                digitalSignature: true,
                cRLSign: true
            }]);

            caCert.sign(caKey, forge.md.sha256.create());

            // Save new CA certificate and key
            const newCaCertPem = forge.pki.certificateToPem(caCert);
            const newCaKeyPem = forge.pki.privateKeyToPem(caKey);

            fs.writeFileSync(caCertPath, newCaCertPem);
            fs.writeFileSync(caKeyPath, newCaKeyPem);

            console.log('✅ New CA certificate and key generated and saved');
            console.log('⚠️  IMPORTANT: Re-install the CA certificate to trust HTTPS sites');
            console.log(`   Certificate location: ${caCertPath}`);
            console.log('✅ CA Certificate and Key loaded successfully');
        } catch (genErr) {
            console.error('❌ Error generating CA certificate:', genErr.message);
            console.error(genErr.stack);
            process.exit(1);
        }
    }
}

function generateCertificate(hostname, clientIp = null) {
    const fromCache = certCache.has(hostname);

    if (fromCache) {
        const cached = certCache.get(hostname);
        // Log cache hit
        db.certLogInsert(hostname, cached.serialNumber, cached.validityStart, cached.validityEnd, true, clientIp)
            .catch(err => console.error('Cert log error:', err));
        return cached;
    }

    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = Date.now().toString();
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    cert.setSubject([
        { name: 'commonName', value: hostname },
        { name: 'organizationName', value: 'Chakhdi Proxy' }
    ]);
    cert.setIssuer(caCert.subject.attributes);
    cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', keyCertSign: false, digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
        { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] }
    ]);

    cert.sign(caKey, forge.md.sha256.create());
    const result = {
        key: forge.pki.privateKeyToPem(keys.privateKey),
        cert: forge.pki.certificateToPem(cert),
        serialNumber: cert.serialNumber,
        validityStart: cert.validity.notBefore.toISOString(),
        validityEnd: cert.validity.notAfter.toISOString()
    };
    certCache.set(hostname, result);

    // Log certificate generation to database
    db.certLogInsert(hostname, result.serialNumber, result.validityStart, result.validityEnd, false, clientIp)
        .catch(err => console.error('Cert log error:', err));

    return result;
}

// Initialize on require
initCA();

module.exports = {
    generateCertificate
};
