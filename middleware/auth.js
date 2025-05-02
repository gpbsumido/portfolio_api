const { auth } = require('express-oauth2-jwt-bearer');
const dotenv = require('dotenv');

dotenv.config();

// Create middleware for checking the JWT
const checkJwt = auth({
  audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
  issuerBaseURL: process.env.NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256'
});

// Optional: Create middleware for checking specific permissions
const checkPermissions = (requiredPermissions) => {
  return (req, res, next) => {
    const permissions = req.auth?.permissions || [];

    const hasPermissions = requiredPermissions.every(permission =>
      permissions.includes(permission)
    );

    if (!hasPermissions) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

module.exports = {
  checkJwt,
  checkPermissions
}; 