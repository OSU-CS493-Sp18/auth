const router = module.exports = require('express').Router();

router.use('/lodgings', require('./lodgings').router);
router.use('/users', require('./users').router);
