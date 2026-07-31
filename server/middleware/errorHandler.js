// server/middleware/errorHandler.js — CargoChain centralized error handler

function errorHandler(err, req, res, next) {
  console.error('[server error]', err.message || err);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';

  if (err.type === 'entity.too.large' || statusCode === 413) {
    statusCode = 413;
    message = 'Payload Too Large';
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}

module.exports = { errorHandler };
