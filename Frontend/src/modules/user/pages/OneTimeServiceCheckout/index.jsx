import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiChevronLeft, FiMapPin, FiCalendar, FiClock, FiCheck, FiX, FiSearch, FiHome, FiBriefcase, FiFlag } from 'react-icons/fi';
import { GoogleMap, Marker, Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import api from '../../../../services/api';
import toast from 'react-hot-toast';
import flutterBridge from '../../../../utils/flutterBridge';

const MAP_LIBRARIES = ['places', 'geometry'];

const containerStyle = {
  width: '105%',
  height: '105%',
  marginLeft: '-2.5%',
  marginTop: '-2.5%'
};

// Use real, fully colorful map options so it shows landmarks, shops, POIs etc.
const mapOptions = {
  disableDefaultUI: false,
  gestureHandling: 'greedy',
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  zoomControl: true
};

const OneTimeServiceCheckout = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draftId');

  // Loading States
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiFailed, setApiFailed] = useState(false);

  // Address Selections
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);

  // Booking Choice
  const [bookingType, setBookingType] = useState('now'); // 'now' | 'scheduled'

  // Modal Control States
  const [showAddressSheet, setShowAddressSheet] = useState(false);
  const [showAddAddressModal, setShowAddAddressModal] = useState(false);

  // Add Address Form States
  const [addAddressSearch, setAddAddressSearch] = useState('');
  const [addAddressFlat, setAddAddressFlat] = useState('');
  const [addAddressLabel, setAddAddressLabel] = useState('HOME'); // Default uppercase Home
  const [addAddressCustomLabel, setAddAddressCustomLabel] = useState('');
  const [addAddressLandmark, setAddAddressLandmark] = useState('');
  const [addAddressMarker, setAddAddressMarker] = useState({ lat: 22.7196, lng: 75.8577 }); // Default Indore coords
  const [addAddressFull, setAddAddressFull] = useState('');
  const [addAddressComponents, setAddAddressComponents] = useState([]);

  // Autocomplete Instance
  const [autocomplete, setAutocomplete] = useState(null);

  // Google Maps SDK Loader
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES
  });

  // Map instance references for dynamic smooth panning
  const [previewMap, setPreviewMap] = useState(null);
  const [pickerMap, setPickerMap] = useState(null);

  const onPreviewMapLoad = useCallback((mapInstance) => {
    setPreviewMap(mapInstance);
  }, []);

  const onPreviewMapUnmount = useCallback(() => {
    setPreviewMap(null);
  }, []);

  const onPickerMapLoad = useCallback((mapInstance) => {
    setPickerMap(mapInstance);
  }, []);

  const onPickerMapUnmount = useCallback(() => {
    setPickerMap(null);
  }, []);

  // Smoothly pan preview map when selected address changes
  useEffect(() => {
    if (previewMap && selectedAddress) {
      const lat = parseFloat(selectedAddress.latitude);
      const lng = parseFloat(selectedAddress.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        previewMap.panTo({ lat, lng });
        previewMap.setZoom(16);
      }
    }
  }, [selectedAddress, previewMap]);

  // Smoothly pan picker map when marker position changes (e.g. from Autocomplete)
  useEffect(() => {
    if (pickerMap && addAddressMarker) {
      const lat = parseFloat(addAddressMarker.lat);
      const lng = parseFloat(addAddressMarker.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        pickerMap.panTo({ lat, lng });
      }
    }
  }, [addAddressMarker, pickerMap]);

  // Get current user location smoothly using flutterBridge / browser geolocation
  const handleLoadCurrentLocation = async () => {
    try {
      let lat = 22.7196;
      let lng = 75.8577;

      try {
        const pos = await flutterBridge.getCurrentLocation();
        if (pos && pos.latitude && pos.longitude) {
          lat = pos.latitude;
          lng = pos.longitude;
        }
      } catch (err) {
        console.warn('FlutterBridge location retrieval failed, trying web geolocation API:', err);
        if (navigator.geolocation) {
          const browserPos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000
            });
          });
          lat = browserPos.coords.latitude;
          lng = browserPos.coords.longitude;
        }
      }

      const newCoords = { lat, lng };
      setAddAddressMarker(newCoords);
      reverseGeocode(newCoords);
    } catch (error) {
      console.error('Error fetching user location:', error);
      const fallbackCoords = { lat: 22.7196, lng: 75.8577 };
      setAddAddressMarker(fallbackCoords);
      reverseGeocode(fallbackCoords);
    }
  };

  useEffect(() => {
    if (!draftId) {
      navigate(-1);
      return;
    }
    fetchAddresses();
  }, [draftId]);

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      setApiFailed(false);
      const res = await api.get('/users/addresses');
      if (res.data.success) {
        const addrList = res.data.data;
        setAddresses(addrList);
        setSelectedAddress(null); // Force explicit selection
      } else {
        setApiFailed(true);
      }
    } catch (error) {
      console.error('Failed to load user addresses:', error);
      setApiFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAddress = (addr) => {
    setSelectedAddress(addr);
    setShowAddressSheet(false);
  };

  const onAutocompleteLoad = (acInstance) => {
    setAutocomplete(acInstance);
  };

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      if (place.geometry) {
        const newCoords = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setAddAddressMarker(newCoords);
        setAddAddressFull(place.formatted_address);
        setAddAddressSearch(place.formatted_address);
        setAddAddressComponents(place.address_components || []);
      }
    }
  };

  const onMarkerDragEnd = (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    const newCoords = { lat, lng };
    setAddAddressMarker(newCoords);
    reverseGeocode(newCoords);
  };

  const onMapClick = (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    const newCoords = { lat, lng };
    setAddAddressMarker(newCoords);
    reverseGeocode(newCoords);
  };

  const reverseGeocode = (coords) => {
    if (!window.google) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: coords }, (results, status) => {
      if (status === 'OK' && results[0]) {
        setAddAddressFull(results[0].formatted_address);
        setAddAddressSearch(results[0].formatted_address);
        setAddAddressComponents(results[0].address_components || []);
      }
    });
  };

  const handleSaveAddress = async () => {
    if (!addAddressFull) {
      toast.error('Please select a valid address using autocomplete or pin');
      return;
    }

    try {
      const getComponent = (type) => {
        return addAddressComponents.find(c => c.types.includes(type))?.long_name || '';
      };

      const city = getComponent('locality') || getComponent('administrative_area_level_2') || '';
      const state = getComponent('administrative_area_level_1') || '';
      const pincode = getComponent('postal_code') || '';
      const street = getComponent('route') || getComponent('sublocality') || '';

      let finalLabel = addAddressLabel;
      if (addAddressLabel === 'OTHER') {
        finalLabel = addAddressCustomLabel.trim() || 'Other';
      }
      
      const capitalizedLabel = finalLabel.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

      const addressParts = [];
      if (addAddressFlat) addressParts.push(addAddressFlat.trim());
      if (addAddressLandmark) addressParts.push(`Near ${addAddressLandmark.trim()}`);
      addressParts.push(addAddressFull.trim());
      const constructedFullAddress = addressParts.join(', ');

      const payload = {
        label: capitalizedLabel,
        fullAddress: constructedFullAddress,
        street: street || addAddressLandmark || '',
        area: addAddressLandmark || '',
        city: city || 'Indore',
        state: state || 'Madhya Pradesh',
        pincode: pincode || '452001',
        latitude: addAddressMarker.lat,
        longitude: addAddressMarker.lng,
        isDefault: addresses.length === 0
      };

      toast.loading('Saving address...');
      const res = await api.post('/users/addresses', payload);
      toast.dismiss();

      if (res.data.success) {
        toast.success('Address saved successfully');
        const newAddr = res.data.data;
        
        setAddresses(prev => [newAddr, ...prev]);
        setSelectedAddress(newAddr);
        
        setAddAddressSearch('');
        setAddAddressFlat('');
        setAddAddressLabel('HOME');
        setAddAddressCustomLabel('');
        setAddAddressLandmark('');
        setShowAddAddressModal(false);
        setShowAddressSheet(false);
      } else {
        toast.error(res.data.message || 'Failed to save address');
      }
    } catch (error) {
      toast.dismiss();
      console.error('Error saving address:', error);
      toast.error('Failed to register address');
    }
  };

  const handleContinue = async () => {
    if (!selectedAddress) {
      toast.error('Please select or add a delivery address to proceed');
      return;
    }

    try {
      setIsSubmitting(true);

      const addressPayload = {
        type: selectedAddress.label.toLowerCase(),
        addressLine1: selectedAddress.fullAddress,
        addressLine2: selectedAddress.street || '',
        city: selectedAddress.city,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
        lat: selectedAddress.latitude,
        lng: selectedAddress.longitude
      };

      const payload = {
        bookingType: bookingType === 'now' ? 'instant' : 'scheduled',
        address: addressPayload,
        scheduledDate: bookingType === 'now' ? new Date() : undefined,
        scheduledTime: bookingType === 'now' ? 'ASAP' : undefined
      };

      const res = await api.put(`/users/one-time-bookings/draft/${draftId}`, payload);
      
      if (res.data.success) {
        localStorage.setItem('selectedAddress', JSON.stringify({
          addressId: selectedAddress._id,
          label: selectedAddress.label,
          fullAddress: selectedAddress.fullAddress,
          latitude: selectedAddress.latitude,
          longitude: selectedAddress.longitude
        }));
        localStorage.setItem('bookingType', bookingType);

        setTimeout(() => {
          setIsSubmitting(false);
          if (bookingType === 'now') {
            navigate(`/user/one-time-review?draftId=${draftId}`);
          } else {
            navigate(`/user/one-time-schedule?draftId=${draftId}`);
          }
        }, 300);
      } else {
        setIsSubmitting(false);
        toast.error(res.data.message || 'Failed to confirm address');
      }
    } catch (error) {
      setIsSubmitting(false);
      console.error('Checkout step error:', error);
      toast.error('Failed to submit checkout information');
    }
  };

  if (loading) {
    return (
      <div className="bg-[#F8FCFC] min-h-screen pb-40 px-5 pt-4 space-y-6 animate-pulse">
        <div className="h-10 w-full flex items-center gap-3">
          <div className="h-9 w-9 bg-gray-50 rounded-full border border-gray-100"></div>
          <div className="h-8 w-1/3 bg-gray-50 rounded-lg"></div>
        </div>
        <div className="h-28 bg-gray-50 rounded-2xl border border-gray-100"></div>
        <div className="h-44 bg-gray-50 rounded-2xl border border-gray-100"></div>
        <div className="h-36 bg-gray-50 rounded-2xl border border-gray-100"></div>
      </div>
    );
  }

  return (
    <div className="bg-[#F8FCFC] min-h-screen pb-36 relative">
      
      {/* Centered Page Title in dark/header element style */}
      <header className="pt-6 pb-2 text-center sticky top-0 bg-[#F8FCFC]/90 backdrop-blur-md z-10">
        <h1 className="text-[14px] font-black text-gray-850 tracking-tight">3. Address & Schedule</h1>
      </header>

      {/* 4-Step Stepper */}
      <div className="px-5 py-4 bg-white">
        <div className="flex items-center justify-between px-2">
          {/* Step 1: Service */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 rounded-full bg-[#10AFA5] flex items-center justify-center text-white text-xs font-bold shadow-xs">✓</div>
            <span className="text-[9px] text-[#10AFA5] font-semibold">Service</span>
          </div>
          <div className="flex-1 h-[2px] bg-[#10AFA5] mx-2 mb-4"></div>

          {/* Step 2: Address & Time */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 rounded-full bg-[#10AFA5] flex items-center justify-center text-white text-xs font-bold shadow-md shadow-[#10AFA5]/25">
              <FiMapPin className="w-3.5 h-3.5" />
            </div>
            <span className="text-[9px] text-[#10AFA5] font-black uppercase tracking-wider">Address & Time</span>
          </div>
          <div className="flex-1 h-[2px] bg-gray-250 mx-2 mb-4"></div>

          {/* Step 3: Review */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 rounded-full bg-white border border-gray-250 flex items-center justify-center text-gray-350 text-xs font-bold">3</div>
            <span className="text-[9px] text-gray-400 font-semibold">Review</span>
          </div>
          <div className="flex-1 h-[2px] bg-gray-250 mx-2 mb-4"></div>

          {/* Step 4: Payment */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 rounded-full bg-white border border-gray-250 flex items-center justify-center text-gray-350 text-xs font-bold">4</div>
            <span className="text-[9px] text-gray-400 font-semibold">Payment</span>
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="px-5 pt-6 space-y-6">
        
        {/* Delivery Address Section */}
        <div className="space-y-3">
          <span className="text-xs font-black text-gray-800 uppercase tracking-wide">Delivery Address</span>

          {apiFailed ? (
            <div className="bg-white rounded-3xl border border-red-100 p-5 text-center space-y-3 shadow-xs">
              <p className="text-xs text-gray-400 font-bold">Couldn't load address list</p>
              <div className="flex justify-center gap-3">
                <button onClick={fetchAddresses} className="px-4 py-2 bg-gray-50 border border-gray-150 text-gray-700 text-[10px] font-black rounded-xl active:scale-95 transition-all">Retry</button>
                <button onClick={() => { handleLoadCurrentLocation(); setShowAddAddressModal(true); }} className="px-4 py-2 bg-[#10AFA5] text-white text-[10px] font-black rounded-xl active:scale-95 transition-all">Add Address</button>
              </div>
            </div>
          ) : addresses.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-6 text-center space-y-4 shadow-2xs">
              <p className="text-xs text-gray-400 font-bold">No saved addresses found</p>
              <button 
                onClick={() => {
                  handleLoadCurrentLocation();
                  setShowAddAddressModal(true);
                }}
                className="px-5 py-3 bg-[#10AFA5] hover:bg-[#0E9D94] text-white font-black text-[11px] rounded-2xl uppercase tracking-wider active:scale-95 transition-all"
              >
                + Add Address
              </button>
            </div>
          ) : !selectedAddress ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-5 space-y-4 shadow-2xs">
              <p className="text-[11px] text-[#10AFA5] font-extrabold uppercase tracking-wider">Please select a delivery address:</p>
              <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-1">
                {addresses.map(addr => (
                  <div 
                    key={addr._id}
                    onClick={() => handleSelectAddress(addr)}
                    className="p-4 rounded-2xl border border-gray-100 hover:border-gray-200 flex items-start gap-3 cursor-pointer transition-all bg-white"
                  >
                    <div className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center shrink-0 mt-0.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-transparent"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-805 leading-none">{addr.label}</span>
                        {addr.isDefault && (
                          <span className="bg-gray-150 text-gray-500 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">Default</span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 font-semibold leading-normal mt-1">
                        {addr.fullAddress}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => {
                  handleLoadCurrentLocation();
                  setShowAddAddressModal(true);
                }}
                className="w-full py-3 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 font-black text-[10px] uppercase tracking-wider rounded-2xl transition-all"
              >
                + Add New Address
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-xs overflow-hidden">
              {/* Address info header */}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-850">{selectedAddress.label}</span>
                  <button 
                    onClick={() => setShowAddressSheet(true)}
                    className="text-[11px] font-black text-[#10AFA5] uppercase tracking-wider active:scale-95 transition-all"
                  >
                    Change
                  </button>
                </div>
                
                <p className="text-[11px] text-gray-400 font-semibold leading-relaxed pr-8">
                  {selectedAddress.fullAddress}
                </p>
              </div>

              {/* Map Canvas Preview - Increased height to h-64 for prominence and clarity */}
              <div 
                onClick={() => setShowAddressSheet(true)}
                className="h-64 w-full bg-gray-55 relative overflow-hidden cursor-pointer"
              >
                {isLoaded && window.google ? (
                  <GoogleMap
                    mapContainerStyle={containerStyle}
                    center={{
                      lat: parseFloat(selectedAddress.latitude) || 22.7196,
                      lng: parseFloat(selectedAddress.longitude) || 75.8577
                    }}
                    zoom={16}
                    options={mapOptions}
                    onLoad={onPreviewMapLoad}
                    onUnmount={onPreviewMapUnmount}
                  >
                    <Marker 
                      position={{
                        lat: parseFloat(selectedAddress.latitude) || 22.7196,
                        lng: parseFloat(selectedAddress.longitude) || 75.8577
                      }}
                      icon={{
                        path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
                        fillColor: "#10AFA5",
                        fillOpacity: 1,
                        strokeColor: "#FFFFFF",
                        strokeWeight: 2,
                        scale: 1.6,
                        anchor: new window.google.maps.Point(12, 22)
                      }}
                    />
                  </GoogleMap>
                ) : loadError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 text-red-500 p-4 text-center">
                    <FiMapPin className="w-8 h-8 text-red-300" />
                    <span className="text-[10px] font-bold mt-2">Failed to load Google Maps</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-55 text-gray-400">
                    <div className="w-6 h-6 border-2 border-[#10AFA5] border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-[10px] font-black uppercase tracking-wider mt-3 text-gray-400">Loading Map...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Booking Type Selector */}
        <div className="space-y-3">
          <span className="text-xs font-black text-gray-800 uppercase tracking-wide">Booking Type</span>
          
          <div className="flex flex-col gap-3">
            {/* Book Now Option */}
            <div 
              onClick={() => setBookingType('now')}
              className={`p-4 rounded-3xl border transition-all cursor-pointer flex items-center justify-between ${
                bookingType === 'now' 
                  ? 'bg-[#F0FDFA]/50 border-[#10AFA5] shadow-xs' 
                  : 'bg-white border-gray-100 hover:border-gray-200'
              }`}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-gray-100 shrink-0">
                  <FiClock className={`w-5 h-5 ${bookingType === 'now' ? 'text-[#10AFA5]' : 'text-gray-400'}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-black text-gray-850 leading-tight">Book Now</h3>
                  <p className="text-[10px] text-gray-400 font-semibold leading-normal mt-0.5">
                    Get expert at your location ASAP
                  </p>
                </div>
              </div>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 transition-all ${
                bookingType === 'now' ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'border-gray-200 bg-white'
              }`}>
                {bookingType === 'now' && <FiCheck className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            {/* Schedule for Later Option */}
            <div 
              onClick={() => setBookingType('scheduled')}
              className={`p-4 rounded-3xl border transition-all cursor-pointer flex items-center justify-between ${
                bookingType === 'scheduled' 
                  ? 'bg-[#F0FDFA]/50 border-[#10AFA5] shadow-xs' 
                  : 'bg-white border-gray-100 hover:border-gray-200'
              }`}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-gray-100 shrink-0">
                  <FiCalendar className={`w-5 h-5 ${bookingType === 'scheduled' ? 'text-[#10AFA5]' : 'text-gray-400'}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-black text-gray-850 leading-tight">Schedule for Later</h3>
                  <p className="text-[10px] text-gray-400 font-semibold leading-normal mt-0.5">
                    Choose date & time
                  </p>
                </div>
              </div>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 transition-all ${
                bookingType === 'scheduled' ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'border-gray-200 bg-white'
              }`}>
                {bookingType === 'scheduled' && <FiCheck className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-white border-t border-gray-100 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.06)] z-20 max-w-[480px] mx-auto">
        <button
          onClick={handleContinue}
          disabled={!selectedAddress || isSubmitting}
          className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 ${
            !selectedAddress || isSubmitting
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-[#10AFA5] shadow-md shadow-[#10AFA5]/15 active:scale-[0.98]'
          }`}
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            'Continue'
          )}
        </button>
      </div>

      {/* Address Selection Bottom Drawer */}
      {showAddressSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs p-4 pb-8">
          <div className="bg-white w-full max-w-[440px] rounded-t-3xl p-6 shadow-2xl relative animate-slideUp">
            <button 
              onClick={() => setShowAddressSheet(false)}
              className="absolute top-4 right-4 w-8 h-8 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <FiX className="w-4 h-4" />
            </button>
            
            <h3 className="text-xs font-black text-gray-800 uppercase tracking-wide mb-6">Select Delivery Address</h3>
            
            <div className="space-y-3 mb-6 max-h-[40vh] overflow-y-auto pr-1">
              {addresses.map(addr => {
                const isSelected = selectedAddress?._id === addr._id;
                
                return (
                  <div 
                    key={addr._id}
                    onClick={() => handleSelectAddress(addr)}
                    className={`p-4 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                      isSelected ? 'border-[#10AFA5] bg-[#F0FDFA]/20' : 'border-gray-100 hover:border-gray-150'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected ? 'border-[#10AFA5]' : 'border-gray-300'
                    }`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#10AFA5]"></div>}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-805 leading-none">{addr.label}</span>
                        {addr.isDefault && (
                          <span className="bg-gray-100 text-gray-500 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">Default</span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 font-semibold leading-normal mt-1 pr-4">
                        {addr.fullAddress}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => {
                  handleLoadCurrentLocation();
                  setAddAddressSearch('');
                  setAddAddressFlat('');
                  setAddAddressFull('');
                  setAddAddressCustomLabel('');
                  setAddAddressLandmark('');
                  setAddAddressComponents([]);
                  setShowAddAddressModal(true);
                }}
                className="w-full py-3 border border-dashed border-gray-250 text-gray-700 hover:text-gray-900 rounded-2xl font-black text-[11px] uppercase tracking-wider active:scale-[0.98] transition-all"
              >
                + Add New Address
              </button>
              
              <button
                onClick={() => setShowAddressSheet(false)}
                className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider bg-gray-100 hover:bg-gray-150 text-gray-700 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Address Modal (Image 1 replica) */}
      {showAddAddressModal && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col max-w-[480px] mx-auto animate-slideUp">
          {/* Header */}
          <header className="px-4 py-4 flex items-center justify-between shrink-0">
            <button 
              onClick={() => setShowAddAddressModal(false)}
              className="w-9 h-9 bg-gray-55 rounded-full flex items-center justify-center text-gray-600 active:scale-95 transition-all border border-gray-100"
            >
              <FiChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-[13px] font-black text-gray-850">Add Address Details</span>
            <button 
              onClick={() => setShowAddAddressModal(false)}
              className="w-9 h-9 bg-gray-55 rounded-full flex items-center justify-center text-gray-600 border border-gray-100"
            >
              <FiX className="w-4 h-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            
            {/* Search autocomplete field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Search Location</label>
              {isLoaded && window.google ? (
                <Autocomplete
                  onLoad={onAutocompleteLoad}
                  onPlaceChanged={onPlaceChanged}
                  options={{
                    componentRestrictions: { country: 'in' },
                    fields: ['formatted_address', 'geometry', 'address_components']
                  }}
                >
                  <div className="relative">
                    <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Enter building, apartment or area name"
                      value={addAddressSearch}
                      onChange={(e) => setAddAddressSearch(e.target.value)}
                      className="w-full pl-10 pr-10 py-3.5 border border-gray-300 rounded-2xl text-[12px] font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#10AFA5] transition-all bg-white"
                    />
                    {addAddressSearch && (
                      <button 
                        onClick={() => { setAddAddressSearch(''); setAddAddressFull(''); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 p-0.5 hover:bg-gray-100 rounded-full"
                      >
                        <FiX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </Autocomplete>
              ) : (
                <input 
                  type="text" 
                  disabled 
                  placeholder="Google Maps SDK loading..." 
                  className="w-full pl-4 py-3.5 border border-gray-300 rounded-2xl text-xs bg-gray-50"
                />
              )}
            </div>

            {/* Draggable google maps section */}
            <div className="h-[380px] rounded-3xl border border-gray-200 overflow-hidden relative shadow-2xs">
              {isLoaded && window.google ? (
                <GoogleMap
                  mapContainerStyle={containerStyle}
                  center={addAddressMarker}
                  zoom={16}
                  options={mapOptions}
                  onLoad={onPickerMapLoad}
                  onUnmount={onPickerMapUnmount}
                  onClick={onMapClick}
                >
                  <Marker
                    position={addAddressMarker}
                    draggable={true}
                    onDragEnd={onMarkerDragEnd}
                    icon={{
                      path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
                      fillColor: "#10AFA5",
                      fillOpacity: 1,
                      strokeColor: "#FFFFFF",
                      strokeWeight: 2,
                      scale: 2,
                      anchor: new window.google.maps.Point(12, 22)
                    }}
                  />
                </GoogleMap>
              ) : loadError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 text-red-500 p-4 text-center">
                  <FiMapPin className="w-8 h-8 text-red-300" />
                  <span className="text-[10px] font-bold mt-2">Failed to load Google Maps SDK</span>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 text-gray-400">
                  <div className="w-6 h-6 border-2 border-[#10AFA5] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black uppercase tracking-wider mt-3 text-gray-400">Loading Map...</span>
                </div>
              )}
              {/* Floating Center Overlay Bubble */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#1e293b] text-white text-[9px] font-black uppercase tracking-wider px-4 py-2.5 rounded-xl pointer-events-none shadow-md z-10">
                Drag marker to adjust location pin
              </div>
            </div>

            {/* Address Form Details */}
            <div className="space-y-4">
              
              {/* Dynamic Flat / House Details based on selected label */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">
                  {addAddressLabel === 'HOME' && 'House / Flat / Block No.'}
                  {addAddressLabel === 'WORK' && 'Office Name / Floor / Company'}
                  {addAddressLabel === 'OTHER' && 'Flat / Apartment / Villa Details'}
                </label>
                <div className="relative">
                  <FiHome className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-450 w-4 h-4" />
                  <input
                    type="text"
                    placeholder={
                      addAddressLabel === 'HOME' ? 'e.g. Flat 402, Block B, House 12' :
                      addAddressLabel === 'WORK' ? 'e.g. 3rd Floor, Tech Mahindra Office' :
                      'e.g. Villa 14, Ground Floor'
                    }
                    value={addAddressFlat}
                    onChange={(e) => setAddAddressFlat(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 border border-gray-300 rounded-2xl text-[12px] font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#10AFA5] transition-all bg-white"
                  />
                </div>
              </div>

              {/* Landmark details */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Nearby Landmark / Directions (Optional)</label>
                <div className="relative">
                  <FiFlag className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-450 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="e.g. Near Hanuman Temple, Opposite Metro Station"
                    value={addAddressLandmark}
                    onChange={(e) => setAddAddressLandmark(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 border border-gray-300 rounded-2xl text-[12px] font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#10AFA5] transition-all bg-white"
                  />
                </div>
              </div>

              {/* Label Tag selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Save Address As</label>
                <div className="flex gap-3">
                  {['HOME', 'WORK', 'OTHER'].map(lbl => (
                    <button
                      key={lbl}
                      onClick={() => {
                        setAddAddressLabel(lbl);
                        if (lbl !== 'OTHER') setAddAddressCustomLabel('');
                      }}
                      className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all border ${
                        addAddressLabel === lbl
                          ? 'bg-[#10AFA5] border-[#10AFA5] text-white shadow-xs'
                          : 'bg-white border-gray-300 text-gray-500 hover:border-gray-450'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Label Input (Only when OTHER is selected) */}
              {addAddressLabel === 'OTHER' && (
                <div className="space-y-1.5 animate-fadeIn">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Specify Custom Label</label>
                  <div className="relative">
                    <FiBriefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-450 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="e.g. Parents House, Gym, Friend's Place"
                      value={addAddressCustomLabel}
                      onChange={(e) => setAddAddressCustomLabel(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 border border-gray-300 rounded-2xl text-[12px] font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#10AFA5] transition-all bg-white"
                    />
                  </div>
                </div>
              )}

            </div>

          </div>

          {/* Action Trigger */}
          <footer className="p-5 shrink-0">
            <button
              onClick={handleSaveAddress}
              disabled={!addAddressFull}
              className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 ${
                !addAddressFull
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-[#10AFA5] shadow-md shadow-[#10AFA5]/15 active:scale-[0.98]'
              }`}
            >
              Verify & Save Address
            </button>
          </footer>
        </div>
      )}
    </div>
  );
};

export default OneTimeServiceCheckout;
