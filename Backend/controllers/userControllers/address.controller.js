const Address = require('../../models/Address');

// Get all active addresses for logged-in user
exports.getAddresses = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const addresses = await Address.find({ userId, isActive: true }).sort({ isDefault: -1, createdAt: -1 });
    res.status(200).json({ success: true, data: addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Save a new address
exports.createAddress = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { label, fullAddress, street, area, city, state, pincode, latitude, longitude, isDefault } = req.body;

    if (!fullAddress || !city || !state || !pincode || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required address fields' });
    }

    // Check if this is the first address, or if it is forced default
    const count = await Address.countDocuments({ userId, isActive: true });
    const makeDefault = count === 0 ? true : !!isDefault;

    // If making default, reset other addresses
    if (makeDefault) {
      await Address.updateMany({ userId, isActive: true }, { isDefault: false });
    }

    const newAddress = await Address.create({
      userId,
      label: label || 'Home',
      fullAddress,
      street: street || '',
      area: area || '',
      city,
      state,
      pincode,
      latitude,
      longitude,
      isDefault: makeDefault
    });

    res.status(201).json({ success: true, data: newAddress });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update existing address
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const { label, fullAddress, street, area, city, state, pincode, latitude, longitude, isDefault } = req.body;

    const address = await Address.findOne({ _id: id, userId, isActive: true });
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    if (isDefault) {
      await Address.updateMany({ userId, isActive: true }, { isDefault: false });
    }

    address.label = label || address.label;
    address.fullAddress = fullAddress || address.fullAddress;
    address.street = street !== undefined ? street : address.street;
    address.area = area !== undefined ? area : address.area;
    address.city = city || address.city;
    address.state = state || address.state;
    address.pincode = pincode || address.pincode;
    address.latitude = latitude !== undefined ? latitude : address.latitude;
    address.longitude = longitude !== undefined ? longitude : address.longitude;
    if (isDefault !== undefined) {
      address.isDefault = !!isDefault;
    }

    await address.save();
    res.status(200).json({ success: true, data: address });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete an address (soft-delete)
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const address = await Address.findOne({ _id: id, userId, isActive: true });
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    address.isActive = false;
    await address.save();

    // If we deleted the default address, set another one as default
    if (address.isDefault) {
      const another = await Address.findOne({ userId, isActive: true });
      if (another) {
        another.isDefault = true;
        await another.save();
      }
    }

    res.status(200).json({ success: true, message: 'Address deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Set as default address
exports.setDefaultAddress = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const address = await Address.findOne({ _id: id, userId, isActive: true });
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    await Address.updateMany({ userId, isActive: true }, { isDefault: false });
    
    address.isDefault = true;
    await address.save();

    res.status(200).json({ success: true, data: address, message: 'Default address updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
