// server/index.js — CargoChain Chat & API Backend Server
// Primary modular backend server. Port 3000 by default.

const express = require('express');
const { config, getCurrentContractAddress, validateConfig } = require('./config/environment');
const { corsMiddleware } = require('./middleware/corsMiddleware');
const { errorHandler } = require('./middleware/errorHandler');
const { startAcceptedConversationProvisioner } = require('./services/acceptedConversationProvisioner');
const chainReader = require('./services/chainReader');

const app = express();

// Configure body limit to 32kb
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use(corsMiddleware);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cargochain-api',
    chainId: config.chainId,
    clientOrigin: config.clientOrigin,
    deliveryEscrowAddress: chainReader.getDeliveryEscrowAddress(),
    userRegistryAddress: getCurrentContractAddress('UserRegistry', config.chainId).toLowerCase(),
    timestamp: new Date().toISOString(),
  });
});


const authRouter = require('./routes/auth');
const chatRouter = require('./routes/chat');

// Mount Auth & Chat routes
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

// Central error handler
app.use(errorHandler);

const PORT = config.port;
function startServer() {
  validateConfig({ requireAuth: true, requireDb: true, requireChain: true });
  startAcceptedConversationProvisioner();
  return app.listen(PORT, '127.0.0.1', () => {
    console.log(`[cargochain-api] listening on http://127.0.0.1:${PORT}`);
    console.log(`[cargochain-api] allowed client origin: ${config.clientOrigin}`);
  });
}

if (require.main === module) startServer();

module.exports = app;
module.exports.startServer = startServer;
