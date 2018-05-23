const router = require('express').Router();
const bcrypt = require('bcryptjs');
const ObjectId = require('mongodb').ObjectId;

const { generateAuthToken, requireAuthentication } = require('../lib/auth');

function validateUserObject(user) {
  return user && user.userID && user.name && user.email && user.password;
}

function insertNewUser(user, mongoDB) {
  return bcrypt.hash(user.password, 8)
    .then((passwordHash) => {
      const userDocument = {
        userID: user.userID,
        name: user.name,
        email: user.email,
        password: passwordHash,
        lodgings: []
      };
      const usersCollection = mongoDB.collection('users');
      return usersCollection.insertOne(userDocument);
    })
    .then((result) => {
      return Promise.resolve(result.insertedId);
    });
}

router.post('/', function (req, res) {
  const mongoDB = req.app.locals.mongoDB;
  if (validateUserObject(req.body)) {
    insertNewUser(req.body, mongoDB)
      .then((id) => {
        res.status(201).json({
          _id: id,
          links: {
            user: `/users/${id}`
          }
        });
      })
      .catch((err) => {
        res.status(500).json({
          error: "Failed to insert new user."
        });
      });
  } else {
    res.status(400).json({
      error: "Request doesn't contain a valid user."
    })
  }
});

router.post('/login', function (req, res) {
  const mongoDB = req.app.locals.mongoDB;
  if (req.body && req.body.userID && req.body.password) {
    getUserByID(req.body.userID, mongoDB, true)
      .then((user) => {
        if (user) {
          return bcrypt.compare(req.body.password, user.password);
        } else {
          return Promise.reject(401);
        }
      })
      .then((loginSuccessful) => {
        if (loginSuccessful) {
          return generateAuthToken(req.body.userID);
        } else {
          return Promise.reject(401);
        }
      })
      .then((token) => {
        res.status(200).json({
          token: token
        });
      })
      .catch((err) => {
        console.log(err);
        if (err === 401) {
          res.status(401).json({
            error: "Invalid credentials."
          });
        } else {
          res.status(500).json({
            error: "Failed to fetch user."
          });
        }
      });
  } else {
    res.status(400).json({
      error: "Request needs a user ID and password."
    })
  }
});

function getUserByID(userID, mongoDB, includePassword) {
  const usersCollection = mongoDB.collection('users');
  const projection = includePassword ? {} : { password: 0 };
  return usersCollection
    .find({ userID: userID })
    .project(projection)
    .toArray()
    .then((results) => {
      return Promise.resolve(results[0]);
    });
}

router.get('/:userID', requireAuthentication, function (req, res, next) {
  const mongoDB = req.app.locals.mongoDB;
  if (req.user !== req.params.userID) {
    res.status(403).json({
      error: "Unauthorized to access that resource"
    });
  } else {
    getUserByID(req.params.userID, mongoDB)
      .then((user) => {
        if (user) {
          res.status(200).json(user);
        } else {
          next();
        }
      })
      .catch((err) => {
        res.status(500).json({
          error: "Failed to fetch user."
        });
      });
  }
});

function getLodgingsByOwnerID(ownerID, mysqlPool) {
  return new Promise((resolve, reject) => {
    mysqlPool.query('SELECT * FROM lodgings WHERE ownerid = ?', [ ownerID ], function (err, results) {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

router.get('/:userID/lodgings', function (req, res, next) {
  const mysqlPool = req.app.locals.mysqlPool;
  const ownerID = parseInt(req.params.userID);
  getLodgingsByOwnerID(ownerID, mysqlPool)
    .then((ownerLodgings) => {
      res.status(200).json({
        lodgings: ownerLodgings
      });
    })
    .catch((err) => {
      res.status(500).json({
        error: `Unable to fetch lodgings for user ${ownerID}`
      });
    });

});

function addLodgingToUser(lodgingID, userID, mongoDB) {
  const usersCollection = mongoDB.collection('users');
  return usersCollection.updateOne(
    { userID: userID },
    { $push: { lodgings: lodgingID } }
  ).then(() => {
    return Promise.resolve(lodgingID);
  });
}

exports.router = router;
exports.getUserByID = getUserByID;
exports.addLodgingToUser = addLodgingToUser;
