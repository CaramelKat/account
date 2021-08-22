const crypto = require('crypto');
const NodeRSA = require('node-rsa');
const fs = require('fs-extra');
const url = require('url');

function nintendoPasswordHash(password, pid) {
	const pidBuffer = Buffer.alloc(4);
	pidBuffer.writeUInt32LE(pid);

	const unpacked = Buffer.concat([
		pidBuffer,
		Buffer.from('\x02\x65\x43\x46'),
		Buffer.from(password)
	]);
	const hashed = crypto.createHash('sha256').update(unpacked).digest().toString('hex');

	return hashed;
}

function generateRandomInt(length = 4) {
	return Math.floor(Math.pow(10, length-1) + Math.random() * 9 * Math.pow(10, length-1));
}

function generateToken(cryptoOptions, tokenOptions) {

	// Access and refresh tokens use a different format since they must be much smaller
	if ([0x1, 0x2].includes(tokenOptions.token_type)) {
		const cryptoPath = `${__dirname}/../certs/access`;
		const aesKey = Buffer.from(fs.readFileSync(`${cryptoPath}/aes.key`, { encoding: 'utf8' }), 'hex');
		const dataBuffer = Buffer.alloc(4 + 8);

		dataBuffer.writeUInt32LE(tokenOptions.pid, 0x0);
		dataBuffer.writeBigUInt64LE(tokenOptions.date, 0x4);

		const iv = Buffer.alloc(16);
		const cipher = crypto.createCipheriv('aes-128-cbc', aesKey, iv);

		let encryptedBody = cipher.update(dataBuffer);
		encryptedBody = Buffer.concat([encryptedBody, cipher.final()]);

		return encryptedBody.toString('base64');
	}

	const publicKey = new NodeRSA(cryptoOptions.public_key, 'pkcs8-public-pem', {
		environment: 'browser',
		encryptionScheme: {
			'hash': 'sha256',
		}
	});

	// Create the buffer containing the token data
	const dataBuffer = Buffer.alloc(1 + 1 + 4 + 8 + 8);

	dataBuffer.writeUInt8(tokenOptions.system_type, 0x0);
	dataBuffer.writeUInt8(tokenOptions.token_type, 0x1);
	dataBuffer.writeUInt32LE(tokenOptions.pid, 0x2);
	dataBuffer.writeBigUInt64LE(tokenOptions.title_id, 0x6);
	dataBuffer.writeBigUInt64LE(tokenOptions.date, 0xE);

	// Calculate the signature of the token body
	const hmac = crypto.createHmac('sha1', cryptoOptions.hmac_secret).update(dataBuffer);
	const signature = hmac.digest();

	// Generate random AES key and IV
	const key = crypto.randomBytes(16);
	const iv = crypto.randomBytes(16);

	// Encrypt the token body with AES
	const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);

	let encryptedBody = cipher.update(dataBuffer);
	encryptedBody = Buffer.concat([encryptedBody, cipher.final()]);

	// Encrypt the AES key with RSA public key
	const encryptedKey = publicKey.encrypt(key);

	// Create crypto config token section
	const cryptoConfig = Buffer.concat([
		encryptedKey,
		iv
	]);

	// Build the token
	const token = Buffer.concat([
		cryptoConfig,
		signature,
		encryptedBody
	]);

	return token.toString('base64'); // Encode to base64 for transport
}

function decryptToken(token) {

	// Access and refresh tokens use a different format since they must be much smaller
	// Assume a small length means access or refresh token
	if (token.length <= 32) {
		const cryptoPath = `${__dirname}/../certs/access`;
		const aesKey = Buffer.from(fs.readFileSync(`${cryptoPath}/aes.key`, { encoding: 'utf8' }), 'hex');

		const iv = Buffer.alloc(16);

		const decipher = crypto.createDecipheriv('aes-128-cbc', aesKey, iv);

		let decryptedBody = decipher.update(token);
		decryptedBody = Buffer.concat([decryptedBody, decipher.final()]);

		return decryptedBody;
	}

	const cryptoPath = `${__dirname}/../certs/access`;

	const cryptoOptions = {
		private_key: fs.readFileSync(`${cryptoPath}/private.pem`),
		hmac_secret: fs.readFileSync(`${cryptoPath}/secret.key`)
	};

	const privateKey = new NodeRSA(cryptoOptions.private_key, 'pkcs1-private-pem', {
		environment: 'browser',
		encryptionScheme: {
			'hash': 'sha256',
		}
	});

	const cryptoConfig = token.subarray(0, 0x90);
	const signature = token.subarray(0x90, 0xA4);
	const encryptedBody = token.subarray(0xA4);

	const encryptedAESKey = cryptoConfig.subarray(0, 128);
	const iv = cryptoConfig.subarray(128);

	const decryptedAESKey = privateKey.decrypt(encryptedAESKey);

	const decipher = crypto.createDecipheriv('aes-128-cbc', decryptedAESKey, iv);

	let decryptedBody = decipher.update(encryptedBody);
	decryptedBody = Buffer.concat([decryptedBody, decipher.final()]);

	const hmac = crypto.createHmac('sha1', cryptoOptions.hmac_secret).update(decryptedBody);
	const calculatedSignature = hmac.digest();

	if (calculatedSignature !== signature) {
		console.log('Token signature did not match');
		return null;
	}

	return decryptedBody;
}

function unpackToken(token) {
	if (token.length <= 32) {
		return {
			pid: token.readUInt32LE(0x0),
			date: token.readBigUInt64LE(0x2)
		};
	}

	return {
		system_type: token.readUInt8(0x0),
		token_type: token.readUInt8(0x1),
		pid: token.readUInt32LE(0x2),
		title_id: token.readBigUInt64LE(0x6),
		date: token.readBigUInt64LE(0xE)
	};
}

function fullUrl(request) {
	return url.format({
		protocol: request.protocol,
		host: request.get('host'),
		pathname: request.originalUrl
	});
}

module.exports = {
	nintendoPasswordHash,
	generateRandomInt,
	generateToken,
	decryptToken,
	unpackToken,
	fullUrl
};