const express = require('express')
const { z_forum, player } = require('../models')
const { getMessage } = require('../helpers/messages')

const router = express.Router()

//=================================
//             Likes DisLikes
//=================================

router.get('/getLikes', async (req, res) => {
	const like = await z_forum.findAll({
		attributes: ['likes_count', 'id', 'author_aid'],
	})

	return res.jsonOK(like)
})

router.post('/upLike/:id', async (req, res) => {
	const { id } = req.params
	const { account_id, body } = req
	const fields = ['likes_count']

	const likedPost = await z_forum.findOne({
		attributes: ['likes_count', 'id', 'author_aid'],
		where: { id: id },
	})

	fields.map(fieldName => {
		const newLike = body[fieldName]
		if (newLike) likedPost[fieldName] = newLike
	})

	await likedPost.save()

	if (!likedPost) return res.jsonNotFound(null)

	return res.jsonOK(likedPost)
})

//=================================
//             Show all posts;
//=================================

router.get('/', async (req, res) => {
	const group_id = 5

	const dashboard = await z_forum.findAll({
		include: [
			{
				model: player,
				required: true,

				where: {
					group_id: group_id,
				},
			},
		],
	})

	return res.jsonOK(dashboard)
})

//=================================
//             Show post by ID;
//=================================
router.get('/:id', async (req, res) => {
	const { id } = req.params
	const like = await z_forum.findOne({
		where: { id: id },
	})
	if (!like) return res.jsonNotFound(null)

	return res.jsonOK(like)
})

//=================================
//             Create a new news;
//=================================

router.post('/create', async (req, res) => {
	const { body } = req

	const { post_topic, post_text, author_aid, author_guid } = body

	const createNews = await z_forum.create({
		author_guid,
		author_aid,
		post_topic,
		post_text,
	})

	return res.jsonOK(createNews)
})

//=================================
//          Comments
//=================================

router.post('/:postId/comment', async (req, res) => {
	//buscando um post;
	const post = await z_forum.findOne({ id: req.params.postId })

	//criando um novo comentário;

	//associando um comentário a um post.
})

module.exports = router
