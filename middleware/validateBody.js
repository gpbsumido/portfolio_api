const { ZodError } = require('zod');

/**
 * Returns Express middleware that validates req.body against a Zod schema.
 * On failure, responds 400 with { error, details }.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Returns Express middleware that validates req.params against a Zod schema.
 * On failure, responds 400 with { error, details }.
 */
function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details });
    }
    req.params = result.data;
    next();
  };
}

module.exports = { validateBody, validateParams };
