import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCheckCircle, FiX, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { MdStar } from 'react-icons/md';
import api from '../../../../../services/api';
import { apiCache } from '../../../../../utils/apiCache';

// Realistic fallbacks
import intenseBathroom2Image from '../../../../../assets/images/pages/Home/MostBookedServices/intense-bathroom-2.jpg';
import automaticTopLoadImage from '../../../../../assets/images/pages/Home/MostBookedServices/automatic-top-load-machine.webp';
import tapRepairImage from '../../../../../assets/images/pages/Home/MostBookedServices/tap-repai.jpg';

const SAMPLE_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
];

const TrustVideoModal = ({ video, onClose }) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(() => {
    let src = video.videoUrl;
    if (!src || src.includes('w3schools.com')) {
      src = SAMPLE_VIDEOS[0];
    }
    return src;
  });

  const handleVideoError = () => {
    console.warn("Video failed to load from src:", currentSrc, "falling back to sample CDN...");
    if (currentSrc !== SAMPLE_VIDEOS[0]) {
      setCurrentSrc(SAMPLE_VIDEOS[0]);
    }
  };

  const attemptPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = isMuted;
    const p = v.play();
    if (p !== undefined) {
      p.then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.warn("Autoplay with audio blocked, trying muted...", err);
        setIsMuted(true);
        v.muted = true;
        v.play().then(() => setIsPlaying(true)).catch((e) => console.error("Muted play failed:", e));
      });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      attemptPlay();
    }, 150);
    return () => clearTimeout(timer);
  }, [currentSrc, video]);

  const togglePlay = (e) => {
    e?.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      v.muted = isMuted;
      v.play().then(() => setIsPlaying(true)).catch((err) => {
        console.warn("Play error, retrying muted...", err);
        v.muted = true;
        setIsMuted(true);
        v.play().then(() => setIsPlaying(true)).catch((e) => console.error("Final play error:", e));
      });
    }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    const newMuted = !isMuted;
    v.muted = newMuted;
    setIsMuted(newMuted);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (v && v.duration) {
      setProgress((v.currentTime / v.duration) * 100);
    }
  };

  return ReactDOM.createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black backdrop-blur-xl sm:p-4 w-screen h-screen"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 250 }}
        className="w-full max-w-md h-full sm:h-[88vh] bg-black sm:rounded-3xl overflow-hidden flex flex-col relative shadow-2xl border-0 sm:border sm:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Video Area */}
        <div className="relative w-full h-full flex items-center justify-center cursor-pointer bg-black" onClick={togglePlay}>
          {video.videoType === 'youtube' ? (
            <iframe
              src={currentSrc?.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/') + '?autoplay=1&mute=0&loop=1&rel=0&controls=0'}
              title={video.title}
              className="w-full h-full object-cover"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              ref={videoRef}
              src={currentSrc}
              autoPlay
              playsInline
              loop
              preload="auto"
              muted={isMuted}
              onError={handleVideoError}
              onCanPlay={attemptPlay}
              onLoadedData={attemptPlay}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="w-full h-full object-cover sm:object-contain"
              poster={video.thumbnail}
            />
          )}

          {/* Top Header Overlay */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
            <div className="flex items-center bg-black/50 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/15 shadow-md">
              <FiCheckCircle className="text-emerald-400 mr-1.5 w-4 h-4" />
              <span className="text-white text-xs font-semibold tracking-wide">Real Experience</span>
            </div>

            <div className="flex items-center gap-2">
              {video.videoType !== 'youtube' && (
                <button
                  type="button"
                  onClick={toggleMute}
                  className="w-9 h-9 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/15 hover:bg-white/20 transition-all active:scale-95 shadow-md"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <FiVolumeX size={18} /> : <FiVolume2 size={18} />}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/15 hover:bg-white/20 transition-all active:scale-95 shadow-md"
                title="Close"
              >
                <FiX size={20} />
              </button>
            </div>
          </div>

          {/* Centered Play/Pause Button Overlay (Interactive) */}
          {!isPlaying && video.videoType !== 'youtube' && (
            <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/30 pointer-events-auto" onClick={togglePlay}>
              <button
                type="button"
                onClick={togglePlay}
                className="w-16 h-16 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center border border-white/25 shadow-2xl hover:scale-110 active:scale-95 transition-transform"
              >
                <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
          )}

          {/* Bottom Info Overlay & Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/95 via-black/65 to-transparent pt-14 z-20 pointer-events-auto">
            {/* Top row: Title + Rating */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-white font-bold text-lg leading-snug flex-1 drop-shadow-md">
                {video.title}
              </h3>
              <div className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/30 backdrop-blur-md px-2.5 py-1 rounded-full shrink-0">
                <MdStar className="text-amber-400" size={16} />
                <span className="text-white text-xs font-extrabold">{video.rating || '4.8'}</span>
              </div>
            </div>

            {/* Description / Customer Quote */}
            {video.description && (
              <p className="text-gray-200 text-xs leading-relaxed mb-3.5 line-clamp-3 font-medium drop-shadow-sm">
                "{video.description}"
              </p>
            )}

            {/* Category / Tag */}
            <div className="flex items-center gap-2 text-xs text-gray-300 font-semibold mb-3">
              <span className="text-emerald-400 font-bold">Service:</span>
              <span>{video.serviceCategory || video.title?.split(' ')[0] || 'Home Service'}</span>
            </div>

            {/* Progress Bar (Video scrub line) */}
            {video.videoType !== 'youtube' && (
              <div className="w-full bg-white/20 h-1 rounded-full overflow-hidden mt-1">
                <div
                  className="bg-[#10AFA5] h-full transition-all duration-150 ease-linear rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

const TrustVideosSection = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const cacheKey = '/public/trust-videos';
        const cached = apiCache.get(cacheKey);
        if (cached && cached.videos?.length > 0) {
          const sanitizedCached = cached.videos.map((v, idx) => ({
            ...v,
            videoUrl: (!v.videoUrl || v.videoUrl.includes('w3schools.com'))
              ? SAMPLE_VIDEOS[idx % SAMPLE_VIDEOS.length]
              : v.videoUrl
          }));
          setVideos(sanitizedCached);
          setLoading(false);
          return;
        }

        const response = await api.get(cacheKey);
        if (response.data?.success && response.data?.videos?.length > 0) {
          const sanitizedVideos = response.data.videos.map((v, idx) => ({
            ...v,
            videoUrl: (!v.videoUrl || v.videoUrl.includes('w3schools.com'))
              ? SAMPLE_VIDEOS[idx % SAMPLE_VIDEOS.length]
              : v.videoUrl
          }));
          setVideos(sanitizedVideos);
          apiCache.set(cacheKey, response.data, 300);
        } else {
          // Fallback to high-performance CDN videos if DB is empty
          setVideos([
            {
              _id: 'v1',
              title: 'AC Repair Done in 45 Minutes',
              rating: '4.8',
              duration: '0:45',
              thumbnail: intenseBathroom2Image,
              videoType: 'url',
              videoUrl: SAMPLE_VIDEOS[0]
            },
            {
              _id: 'v2',
              title: 'Washing Machine Service Experience',
              rating: '4.7',
              duration: '0:32',
              thumbnail: automaticTopLoadImage,
              videoType: 'url',
              videoUrl: SAMPLE_VIDEOS[1]
            },
            {
              _id: 'v3',
              title: 'Geyser Repair at Home',
              rating: '4.8',
              duration: '0:40',
              thumbnail: tapRepairImage,
              videoType: 'url',
              videoUrl: SAMPLE_VIDEOS[2]
            }
          ]);
        }
      } catch (error) {
        console.error('Error fetching trust videos:', error);
        // Fallback to high-performance CDN videos if error
        setVideos([
          {
            _id: 'v1',
            title: 'AC Repair Done in 45 Minutes',
            rating: '4.8',
            duration: '0:45',
            thumbnail: intenseBathroom2Image,
            videoType: 'url',
            videoUrl: SAMPLE_VIDEOS[0]
          },
          {
            _id: 'v2',
            title: 'Washing Machine Service Experience',
            rating: '4.7',
            duration: '0:32',
            thumbnail: automaticTopLoadImage,
            videoType: 'url',
            videoUrl: SAMPLE_VIDEOS[1]
          },
          {
            _id: 'v3',
            title: 'Geyser Repair at Home',
            rating: '4.8',
            duration: '0:40',
            thumbnail: tapRepairImage,
            videoType: 'url',
            videoUrl: SAMPLE_VIDEOS[2]
          }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, []);

  const handleDragStart = (e) => {
    const slider = scrollRef.current;
    if (!slider) return;
    slider.isDown = true;
    slider.startX = e.pageX - slider.offsetLeft;
    slider.scrollLeftInit = slider.scrollLeft;
  };

  const handleDragEnd = () => {
    const slider = scrollRef.current;
    if (!slider) return;
    slider.isDown = false;
  };

  const handleDragMove = (e) => {
    const slider = scrollRef.current;
    if (!slider || !slider.isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - slider.startX) * 2; // Scroll-fast factor
    slider.scrollLeft = slider.scrollLeftInit - walk;
  };

  if (loading) return null;

  return (
    <div className="mb-6 px-4 mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-black">
          Real service experiences
        </h2>
      </div>

      <div 
        ref={scrollRef}
        className="flex overflow-x-auto scrollbar-hide gap-3.5 pb-4 -mx-4 px-4 snap-x snap-mandatory custom-scrollbar"
        onMouseDown={handleDragStart}
        onMouseLeave={handleDragEnd}
        onMouseUp={handleDragEnd}
        onMouseMove={handleDragMove}
        style={{ cursor: 'grab' }}
      >
        {videos.map((video) => (
          <motion.div
            key={video._id}
            className="flex-shrink-0 w-[156px] sm:w-[170px] snap-center relative group cursor-pointer"
            onClick={() => setActiveVideo(video)}
          >
            {/* Image Container */}
            <div className="relative w-full h-[96px] sm:h-[106px] rounded-[12px] overflow-hidden mb-2 shadow-[0_4px_16px_rgba(15,23,42,0.04)] bg-[#f8fafc]">
              <img fetchPriority="low" loading="lazy" 
                src={video.thumbnail} 
                alt={video.title} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              {/* Dark Overlay for better button visibility */}
              <div className="absolute inset-0 bg-black/10 transition-opacity group-hover:bg-black/20" />
              
              {/* Play Button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-5 h-5 text-[#0F172A] ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>

              {/* Duration Badge */}
              <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-bold px-1.5 py-[1px] rounded-[4px]">
                {video.duration || '0:45'}
              </div>
            </div>

            {/* Content info below image */}
            <div className="pr-2">
              <h3 className="text-[#0F172A] font-bold text-[13px] leading-[1.3] mb-1 line-clamp-2">
                {video.title}
              </h3>
              {video.description && (
                <p className="text-[#475569] text-[11px] leading-[1.4] mb-1.5 line-clamp-2 italic">
                  "{video.description}"
                </p>
              )}
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#64748B]">
                <MdStar className="text-[#F59E0B] w-3.5 h-3.5" /> 
                <span className="mt-[1px]">{video.rating || '4.8'}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Video Player Bottom Sheet / Modal */}
      <AnimatePresence>
        {activeVideo && (
          <TrustVideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default TrustVideosSection;
