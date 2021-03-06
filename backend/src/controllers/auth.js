const express = require('express')
const encrypt = require('js-sha1')
const crypto = require('crypto')
const multer = require('multer')
const fs = require('fs')
const { promisify } = require('util')
const path = require('path')

const mailer = require('../services/mailer')

const { account } = require('../models')
const { accountSignUp, accountSignIn } = require('../validators/account')
const { getMessage } = require('../helpers/messages')
const {
	generateJwt,
	verifyJwt,
	generateRefreshJwt,
	verifyRefreshJwt,
	getTokenFromHeaders,
} = require('../helpers/jwt')

// File upload middleware (for profile pictures)
const storage = multer.diskStorage({
	destination: 'uploads/',
	filename: (req, file, cb) => {
		const filename = file.originalname
		const finalFileName = `${Date.now()}-${filename}`

		cb(null, finalFileName)
	},
})

const upload = multer({ storage: storage, limits: { fileSize: 1000000 } })

const router = express.Router()

router.post('/sign-in', accountSignIn, async (req, res) => {
	const { name, password } = req.body
	const accounts = await account.findOne({ where: { name } })

	const parsedBody = req.body
	const encryptedPassword = encrypt(parsedBody.password)

	const accountFound = await account.findOne({
		where: { name: parsedBody.name, password: encryptedPassword },
	})

	if (!accountFound)
		return res.jsonBadRequest(null, getMessage('account.signin.failed'))

	const token = generateJwt({ id: accounts.id })
	const refreshToken = generateRefreshJwt({
		id: accounts.id,
		version: accounts.jwtVersion,
	})

	return res.jsonOK(accounts, getMessage('account.signin.success'), {
		token,
		refreshToken,
	})
})

router.post('/sign-up', accountSignUp, async (req, res) => {
	const { name, password, email } = req.body

	const hash = crypto.createHash('sha1').update(password).digest('hex')

	const accounts = await account.findOne({ where: { name } })
	if (accounts)
		return res.jsonBadRequest(null, getMessage('account.signup.name_exists'))

	const emails = await account.findOne({ where: { email } })
	if (emails)
		return res.jsonBadRequest(null, getMessage('account.signup.email_exists'))

	const newAccount = await account.create({
		name,
		password: hash,
		email,
	})

	const token = generateJwt({ id: newAccount.id })
	const refreshToken = generateRefreshJwt({
		id: newAccount.id,
		version: newAccount.jwtVersion,
	})

	return res.jsonOK(newAccount, getMessage('account.signup.sucess'), {
		token,
		refreshToken,
	})
})

router.post('/forgot', async (req, res) => {
	const { email } = req.body
	try {
		const accounts = await account.findOne({ where: { email } })

		if (!accounts)
			return res.jsonBadRequest(
				null,
				getMessage('account.forgot_password.email_notexists')
			)

		const forgotToken = crypto.randomBytes(20).toString('hex')

		const now = new Date()
		now.setHours(now.getHours() + 1)

		await accounts.update({
			passwordResetToken: forgotToken,
			passwordResetExpires: now,
		})

		mailer.sendMail(
			{
				to: email,
				from: 'hatiaac@gmail.com',
				template: 'auth/forgot_password',
				context: { forgotToken },
			},
			(err) => {
				console.log(err)
				if (err)
					return res.jsonBadRequest(
						null,
						getMessage('response.json_server_error')
					)
			}
		)
		return res.jsonOK(email, getMessage('account.forgot_password.sucess'))
	} catch (error) {
		return res.jsonBadRequest(null, getMessage('response.json_server_error'))
	}
})

router.post('/reset', async (req, res) => {
	const { email, token, password } = req.body

	try {
		const accounts = await account.findOne({
			where: { email },
		})

		if (!accounts)
			return res.jsonBadRequest(
				null,
				getMessage('account.reset_password.email_notexists')
			)

		if (token !== accounts.passwordResetToken)
			return res.jsonUnauthorized(
				null,
				getMessage('account.reset_password.invalid_token')
			)

		const now = new Date()

		if (now > accounts.passwordResetExpires)
			return res.jsonBadRequest(
				null,
				getMessage('account.reset_password.passwordResetExpires')
			)

		const hash = crypto.createHash('sha1').update(password).digest('hex')

		await accounts.update({
			password: hash,
		})

		res.jsonOK(accounts)
	} catch (error) {
		console.log(error)
		return res.jsonBadRequest(null)
	}
})

router.put('/profile_info', async (req, res) => {
	const { body } = req
	const fields = ['rlname', 'location']
	const token = getTokenFromHeaders(req.headers)

	if (!token) {
		return res.jsonUnauthorized(null, getMessage('response.json_invalid_token'))
	}

	const decoded = verifyJwt(token)

	const accounts = await account.findByPk(decoded.id)
	if (!accounts)
		return res.jsonUnauthorized(null, getMessage('response.json_invalid_token'))

	fields.map((fieldName) => {
		const newValue = body[fieldName]
		if (newValue) accounts[fieldName] = newValue
	})

	await accounts.save()
	return res.jsonOK(accounts, getMessage('account.reset_password.sucess'))
})

router.post('/profile_name', async (req, res) => {
	const { body } = req
	const { profileName } = body

	try {
		const token = getTokenFromHeaders(req.headers)

		if (!token) {
			return res.jsonUnauthorized(
				null,
				getMessage('response.json_invalid_token')
			)
		}

		const decoded = verifyJwt(token)

		const accounts = await account.findByPk(decoded.id)
		if (!accounts)
			return res.jsonUnauthorized(
				null,
				getMessage('response.json_invalid_token')
			)

		const checkProfileName = await account.findOne({ where: { profileName } })
		if (checkProfileName)
			return res.jsonBadRequest(
				null,
				getMessage('Profile name exists, please choose other.')
			)

		await accounts.update({
			profileName,
		})

		res.jsonOK(
			accounts.profileName,
			getMessage('account.settings.avatar_success')
		)
	} catch (error) {
		return res.jsonBadRequest(null, error)
	}
})

router.post('/refresh', async (req, res) => {
	const token = getTokenFromHeaders(req.headers)
	if (!token) {
		return res.jsonUnauthorized(null, getMessage('response.json_invalid_token'))
	}

	try {
		const decoded = verifyRefreshJwt(token)
		const accounts = await account.findByPk(decoded.id)
		if (!accounts)
			return res.jsonUnauthorized(
				null,
				getMessage('response.json_invalid_token')
			)

		if (decoded.version !== accounts.jwtVersion)
			return res.jsonUnauthorized(
				null,
				getMessage('response.json_invalid_token')
			)

		const meta = {
			token: generateJwt({ id: accounts.id }),
		}

		return res.jsonOK(null, null, meta)
	} catch (error) {
		return res.jsonUnauthorized(null, getMessage('response.json_invalid_token'))
	}
})

router.post('/avatar', upload.single('avatar'), async (req, res) => {
	try {
		const token = getTokenFromHeaders(req.headers)

		if (!token) {
			return res.jsonUnauthorized(
				null,
				getMessage('response.json_invalid_token')
			)
		}

		const decoded = verifyJwt(token)

		const accounts = await account.findByPk(decoded.id)
		if (!accounts)
			return res.jsonUnauthorized(
				null,
				getMessage('response.json_invalid_token')
			)

		const finalFileName = req.file

		await accounts.update({
			avatar: `uploads/${finalFileName.filename}`,
		})

		res.jsonOK(accounts, getMessage('account.settings.avatar_success'))
	} catch (error) {
		return res.jsonBadRequest(null, error)
	}
})

router.get('/avatar', async (req, res) => {
	try {
		const token = getTokenFromHeaders(req.headers)

		if (!token) {
			return res.jsonUnauthorized(
				null,
				getMessage('response.json_invalid_token')
			)
		}

		const decoded = verifyJwt(token)

		const accounts = await account.findByPk(decoded.id)
		if (!accounts)
			return res.jsonUnauthorized(
				null,
				getMessage('response.json_invalid_token')
			)

		const { avatar } = accounts

		if (avatar !== '') {
			const URL_AVATAR = `http://localhost:3001/${avatar}`
			res.jsonOK(URL_AVATAR)
		} else {
			res.jsonOK(accounts)
		}
	} catch (error) {
		return res.jsonBadRequest(null, error)
	}
})

router.delete('/avatarDelete', async (req, res) => {
	try {
		const token = getTokenFromHeaders(req.headers)

		if (!token) {
			return res.jsonUnauthorized(null, 'Invalid token')
		}

		const decoded = verifyJwt(token)

		const accounts = await account.findByPk(decoded.id)
		if (!accounts) return res.jsonUnauthorized(null, 'Invalid token.')

		const { avatar } = accounts
		if (avatar !== '') {
			await accounts.update({
				avatar: '',
			})

			const removeUpload = avatar.slice(8, avatar.length)

			promisify(fs.unlink)(
				path.resolve(__dirname, '..', '..', 'uploads', removeUpload)
			)

			res.jsonOK(accounts, 'avatar deletado.')
		} else {
			res.jsonBadRequest(null, 'não foi encontrado nenhum avatar.')
		}
	} catch (error) {
		return res.jsonBadRequest(null, error)
	}
})

module.exports = router
