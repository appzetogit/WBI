const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getCounts,
  getClients,
  getClientById,
  createClient,
  updateClient,
  getContracts,
  getContractById,
  createContract,
  updateContract,
  getScopeChanges,
  createScopeChange,
  updateScopeChange,
  getConversations,
  getConversationById,
  sendMessage,
  getProposals
} = require('../../controllers/vendorControllers/clientsContractsController');

router.get('/counts', authenticate, getCounts);

router.get('/clients', authenticate, getClients);
router.post('/clients', authenticate, createClient);
router.get('/clients/:id', authenticate, getClientById);
router.patch('/clients/:id', authenticate, updateClient);

router.get('/contracts', authenticate, getContracts);
router.post('/contracts', authenticate, createContract);
router.get('/contracts/:id', authenticate, getContractById);
router.patch('/contracts/:id', authenticate, updateContract);

router.get('/scope-changes', authenticate, getScopeChanges);
router.post('/scope-changes', authenticate, createScopeChange);
router.patch('/scope-changes/:id', authenticate, updateScopeChange);

router.get('/conversations', authenticate, getConversations);
router.get('/conversations/:id', authenticate, getConversationById);
router.post('/conversations/:id/messages', authenticate, sendMessage);

router.get('/proposals', authenticate, getProposals);

module.exports = router;
