const router = require('express').Router();

/**
 * [GET]
 * Implementation of for: https://api.pretendo.cc/v1/user
 * Description: Gets PNID details about the current user
 */
router.get('/', async (request, response) => {
	const { pnid } = request;

	if (!pnid) {
		return response.status(400).json({
			app: 'api',
			status: 400,
			error: 'Invalid or missing access token'
		});
	}

	return response.json({
		access_level: pnid.get('access_level'),
		server_access_level: pnid.get('server_access_level'),
		pid: pnid.get('pid'),
		creation_date: pnid.get('creation_date'),
		updated: pnid.get('updated'),
		username: pnid.get('username'),
		birthdate: pnid.get('birthdate'),
		gender: pnid.get('gender'),
		country: pnid.get('country'),
		email: {
			address: pnid.get('email.address'),
		},
		timezone: {
			name: pnid.get('timezone.name')
		},
		mii: {
			data: pnid.get('mii.data'),
			name: pnid.get('mii.name'),
			image_url: `https://pretendo-cdn.b-cdn.net/mii/${pnid.get('pid')}/normal_face.png`
		},
		flags: {
			marketing: pnid.get('flags.marketing')
		},
		connections: {
			discord: {
				id: pnid.get('connections.discord.id'),
				access_token: pnid.get('connections.discord.access_token'),
				refresh_token: pnid.get('connections.discord.refresh_token'),
			}
		}
	});
});

module.exports = router;