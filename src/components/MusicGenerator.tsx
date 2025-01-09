import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { TaskResponse, GenerationHistoryItem, Song } from '../types/api';
import { LoadingWave } from './';
import { generateValentineLyrics } from '../services/gemini';
import { HeartIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { getErrorMessage } from '../utils/errorHandling';
import { logError } from './ErrorLoggerProvider';
import { InfoModal } from './InfoModal';
import { ValentineCaptcha } from './ValentineCaptcha';
import { profanityFilter } from '../services/profanityFilter';
import { CustomMusicPlayer } from './CustomMusicPlayer';
import { ShareButton } from './ShareButton';

const API_KEY = import.meta.env.VITE_SUNO_API_KEY;
const HISTORY_KEY = 'music_generation_history';

console.log('API Key loaded:', API_KEY ? 'Yes' : 'No');

if (!API_KEY) {
  console.error('API key is not defined in environment variables');
}

const APP_ENABLED = import.meta.env.VITE_APP_ENABLED === 'true';
const MAINTENANCE_MESSAGE = import.meta.env.VITE_MAINTENANCE_MESSAGE || "System is temporarily unavailable";

const GENRE_OPTIONS = [
  { value: 'pop', label: 'Pop' },
  { value: 'rock', label: 'Rock' },
  { value: 'r&b', label: 'R&B' },
  { value: 'hip-hop', label: 'Hip Hop' },
  { value: 'jazz', label: 'Jazz' },
  { value: 'classical', label: 'Classical' },
  { value: 'electronic', label: 'Electronic' }
];

const MOOD_OPTIONS = [
  { value: 'happy', label: 'Happy' },
  { value: 'sad', label: 'Sad' },
  { value: 'energetic', label: 'Energetic' },
  { value: 'calm', label: 'Calm' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'melancholic', label: 'Melancholic' }
];

const ERA_OPTIONS = [
  { value: '1970s', label: '70s' },
  { value: '1980s', label: '80s' },
  { value: '1990s', label: '90s' },
  { value: '2000s', label: '2000s' },
  { value: '2010s', label: '2010s' },
  { value: 'modern', label: 'Modern' }
];

const PROMPT_TYPES = [
  { value: 'romantic', label: 'Romantic Love' },
  { value: 'friendship', label: 'Friendship' },
  { value: 'nature', label: 'Nature & Beauty' },
  { value: 'inspiration', label: 'Inspirational' }
];

const MIN_LYRICS_CHARS = 25;
const MAX_LYRICS_CHARS = 900;
const MAX_HISTORY_ITEMS = 5;

// Move type definition outside (this is fine)
type PreviewData = {
  isOpen: boolean;
  request?: any;
  response?: any;
};

// Move PreviewModal component outside MusicGenerator (this is fine)
function PreviewModal({ 
  isOpen, 
  onClose, 
  request, 
  response 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  request?: any; 
  response?: any; 
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-4 border-b">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Request/Response Preview</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <h4 className="font-medium mb-2">Request Data:</h4>
            <pre className="bg-gray-50 p-3 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(request, null, 2)}
            </pre>
          </div>
          {response && (
            <div>
              <h4 className="font-medium mb-2">Response Data:</h4>
              <pre className="bg-gray-50 p-3 rounded-lg overflow-x-auto text-sm">
                {JSON.stringify(response, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// First, add a NotificationComponent if you don't have one already
function NotificationComponent({ notification, onClose }: { 
  notification: { type: 'success' | 'error' | 'warning'; message: string; duration?: number } | null;
  onClose: () => void;
}) {
  if (!notification) return null;

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500'
  }[notification.type];

  return (
    <div className="fixed top-4 right-4 z-50 animate-fade-in">
      <div className={`${bgColor} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2`}>
        <span>{notification.message}</span>
        <button onClick={onClose} className="text-white hover:text-gray-200">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Add this component for displaying generation time
function GenerationTime({ startTime, endTime }: { startTime: number; endTime?: number }) {
  if (!startTime || !endTime) return null;

  const duration = endTime - startTime;
  const minutes = Math.floor(duration / (1000 * 60));
  const seconds = Math.floor((duration % (1000 * 60)) / 1000);

  return (
    <span className="text-xs text-gray-500 flex items-center gap-1">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Generated in {minutes}:{seconds.toString().padStart(2, '0')}
    </span>
  );
}

// First, let's create a helper type for the history item
type HistoryItemInput = {
  id: string;
  prompt: string;
  status: string;
  timestamp: number;
  completedAt?: number;
  songs?: Song[];
  error?: string;
  tags?: string;
};

// First, add these new components for better style selection
const StyleOption = ({ 
  label, 
  value, 
  selected, 
  icon, 
  onChange,
  colorScheme = 'pink'
}: { 
  label: string;
  value: string;
  selected: boolean;
  icon: React.ReactNode;
  onChange: (value: string) => void;
  colorScheme?: 'pink' | 'blue';
}) => {
  const colors = {
    pink: {
      selected: 'bg-pink-500 text-white shadow-md scale-102',
      hover: 'hover:bg-pink-50 hover:text-pink-500',
      icon: 'text-pink-500',
      border: 'before:border-pink-200 hover:before:border-pink-500',
      glow: 'after:bg-pink-500'
    },
    blue: {
      selected: 'bg-blue-500 text-white shadow-md scale-102',
      hover: 'hover:bg-blue-50 hover:text-blue-500',
      icon: 'text-blue-500',
      border: 'before:border-blue-200 hover:before:border-blue-500',
      glow: 'after:bg-blue-500'
    }
  }[colorScheme];

  return (
    <button
      onClick={() => onChange(value)}
      className={`
        relative flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 
        before:absolute before:inset-0 before:rounded-lg before:border before:transition-colors
        after:absolute after:inset-0 after:rounded-lg after:opacity-0 after:transition-opacity after:duration-300
        hover:after:opacity-5
        ${
          selected 
            ? colors.selected
            : `bg-white ${colors.hover} text-gray-600 ${colors.border} ${colors.glow}`
        } w-full overflow-hidden group
      `}
    >
      <span 
        className={`
          text-xl relative z-10 transition-transform duration-300 group-hover:scale-110
          ${selected ? 'text-white' : colors.icon}
        `}
      >
        {icon}
      </span>
      <span className="text-sm font-medium relative z-10">{label}</span>
      
      {/* Add animated gradient border when selected */}
      {selected && (
        <div 
          className={`
            absolute inset-0 rounded-lg opacity-50
            bg-gradient-to-r ${
              colorScheme === 'pink' 
                ? 'from-pink-400 via-red-300 to-pink-400' 
                : 'from-blue-400 via-cyan-300 to-blue-400'
            }
            animate-gradient-x
          `}
        />
      )}
    </button>
  );
};

// Add this component for the maintenance message
function MaintenanceMessage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-pink-50 to-red-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
        <div className="text-6xl mb-4">💝</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          System Maintenance
        </h1>
        <p className="text-gray-600 mb-6">
          {MAINTENANCE_MESSAGE}
        </p>
        <div className="animate-pulse text-pink-500">
          <HeartIcon className="w-8 h-8 mx-auto" />
        </div>
      </div>
    </div>
  );
}

// Update the BASE_URL constant to handle both development and production
const BASE_URL = window.location.hostname === 'localhost' 
  ? '/' 
  : '/lyrics-to-song/';

export default function MusicGenerator() {
  const [previewData, setPreviewData] = useState<PreviewData>({ isOpen: false });
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
    duration?: number;
  } | null>(null);
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [selectedOptions, setSelectedOptions] = useState({
    genre: '',
    voiceType: '',
    mood: '',
    era: ''
  });
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [lyricsIdea, setLyricsIdea] = useState('');
  const [promptType, setPromptType] = useState<'romantic' | 'friendship' | 'nature' | 'inspiration'>('romantic');
  const [showLyricsInput, setShowLyricsInput] = useState(false);
  const completedTasksRef = useRef<Set<string>>(new Set());
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(true);
  const [hasFilteredContent, setHasFilteredContent] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Add this effect at the top of your component, right after the state declarations
  useEffect(() => {
    // Load initial history from localStorage
    const savedHistory = localStorage.getItem(HISTORY_KEY);
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        // Ensure the history items have the correct status type
        const validHistory = parsedHistory.map((item: any) => ({
          ...item,
          status: (item.status === 'completed' || item.status === 'failed') 
            ? item.status 
            : 'pending'
        }));
        setHistory(validHistory);
      } catch (error) {
        console.error('Error loading history:', error);
        // If there's an error, clear the corrupted history
        localStorage.removeItem(HISTORY_KEY);
      }
    }
  }, []); // Empty dependency array means this runs once on mount

  // Function to fetch task details
  const fetchTaskDetails = async (taskId: string) => {
    try {
      const response = await axios.get<TaskResponse>(
        `https://api.piapi.ai/api/v1/task/${taskId}`,
        {
          headers: {
            'X-API-Key': API_KEY
          }
        }
      );

      return response.data;
    } catch (err) {
      console.error(`Error fetching task ${taskId}:`, err);
      return null;
    }
  };

  // Update the updateHistory function
  const updateHistory = (newHistory: HistoryItemInput[]) => {
    const validHistory = newHistory.map(item => ({
      ...item,
      id: item.id || '',
      prompt: item.prompt || '',
      // Ensure status is one of the valid values
      status: (['pending', 'completed', 'failed'].includes(item.status) 
        ? item.status 
        : 'pending') as 'pending' | 'completed' | 'failed',
      timestamp: item.timestamp || Date.now()
    }));
    setHistory(validHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(validHistory));
  };

  // Update the history update effect
  useEffect(() => {
    const updateHistoryWithCompletedTasks = async () => {
      const savedHistory = localStorage.getItem(HISTORY_KEY);
      if (!savedHistory) return;

      const parsedHistory: GenerationHistoryItem[] = JSON.parse(savedHistory);
      let hasUpdates = false;

      const updatedHistory = await Promise.all(
        parsedHistory.map(async (item) => {
          // Only check status for pending items
          if (item.status === 'pending') {
            const taskDetails = await fetchTaskDetails(item.id);
            if (taskDetails) {
              const isCompleted = taskDetails.data.status === 'completed';
              const isFailed = taskDetails.data.status === 'failed';

              if (isCompleted || isFailed) {
                hasUpdates = true;
                if (isCompleted) {
                  playSuccessBeep();
                }
                return {
                  ...item,
                  status: isCompleted ? 'completed' as const : 'failed' as const,
                  songs: isCompleted ? taskDetails.data.output.songs || [] : undefined,
                  error: isFailed ? taskDetails.data.error?.message : undefined,
                  completedAt: Date.now()
                };
              }
            }
          }
          return item;
        })
      );

      // Only update if there were changes
      if (hasUpdates) {
        updateHistory(updatedHistory);
      }
    };

    // Track active intervals
    let intervalId: number | null = null;

    // Only set up interval if there are pending tasks
    const hasPendingTasks = history.some(item => item.status === 'pending');
    
    if (hasPendingTasks) {
      // Initial check
      updateHistoryWithCompletedTasks();
      // Set up periodic check only if there are pending tasks
      intervalId = window.setInterval(updateHistoryWithCompletedTasks, 5000);
    }

    return () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, [history]); // Add history as dependency to react to new tasks

  // Update the addToHistory function
  const addToHistory = (item: HistoryItemInput) => {
    const newItem: GenerationHistoryItem = {
      ...item,
      status: 'pending' as const, // Force the correct type
      completedAt: undefined
    };
    
    const newHistory = [newItem, ...history];
    updateHistory(newHistory);
  };

  const removeFromHistory = (id: string) => {
    const newHistory = history.filter(item => item.id !== id);
    updateHistory(newHistory);
  };

  const clearHistory = () => {
    updateHistory([]);
    completedTasksRef.current.clear();
  };

  // Add a new audio context for system beep
  const audioContext = useMemo(() => {
    if (typeof window !== 'undefined') {
      return new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return null;
  }, []);

  // Add function to play success beep
  const playSuccessBeep = () => {
    if (audioContext) {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 800;
      gainNode.gain.value = 0.1;
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    }
  };

  // Update the SongDisplay component
  const SongDisplay = useMemo(() => {
    return ({ song }: { song: Song }) => {
      if (!song.finished) return null;

      // Function to get the correct song URL
      const getSongUrl = (path: string) => {
        // Check if the path is already a full URL
        if (path.startsWith('http')) {
          return path;
        }
        // Check if path starts with a slash
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        // Combine with BASE_URL
        return `${window.location.origin}${BASE_URL}${cleanPath}`;
      };

      // Get the correct URLs
      const songUrl = getSongUrl(song.song_path);
      const imageUrl = getSongUrl(song.image_path);

      return (
        <div className="bg-white rounded-lg p-2 md:p-3 shadow-sm">
          <div className="flex items-center gap-2 md:gap-3">
            <img 
              src={imageUrl}
              alt={song.title}
              className="w-12 h-12 md:w-16 md:h-16 rounded-lg object-cover"
            />
            <div className="flex-1">
              <h4 className="font-medium text-gray-800">{song.title}</h4>
              <div className="flex flex-wrap gap-1 mt-1">
                {song.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="text-xs bg-pink-100 text-pink-800 px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <ShareButton 
              title={song.title} 
              url={songUrl}
            />
          </div>
          
          <div className="mt-3">
            <CustomMusicPlayer src={songUrl} title={song.title} />
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = songUrl;
                link.download = `${song.title}.mp3`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="mt-2 w-full text-pink-600 hover:text-pink-700 text-sm font-medium flex items-center justify-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Song
            </button>
          </div>
        </div>
      );
    };
  }, []); // Empty dependency array since this is a static component

  const generateMusic = async () => {
    if (!APP_ENABLED) {
      setNotification({
        type: 'error',
        message: MAINTENANCE_MESSAGE,
        duration: 5000
      });
      return;
    }

    // Get voice type and build tags/negative tags
    const isFemaleSinger = selectedOptions.voiceType === 'female';
    const voiceTags = isFemaleSinger 
      ? ['female_vocals', 'female_voice', 'female_singer']
      : ['male_vocals', 'male_voice', 'male_singer'];
    const negativeTags = isFemaleSinger 
      ? ['male_vocals', 'male_voice', 'male_singer']
      : ['female_vocals', 'female_voice', 'female_singer'];

    // Build the voice description
    const voiceDescription = isFemaleSinger 
      ? 'female vocal, female singer, female voice'
      : 'male vocal, male singer, male voice';

    const requestData = {
      model: 'music-u',
      task_type: 'generate_music',
      input: {
        gpt_description_prompt: `${voiceDescription}, ${selectedOptions.genre}, ${selectedOptions.mood}, ${selectedOptions.era}`,
        lyrics_type: 'user',
        make_instrumental: false,
        negative_tags: negativeTags.join(','),
        prompt: prompt,
        seed: Math.floor(Math.random() * 1000000),
        tags: voiceTags.join(',')
      }
    };

    try {
      setIsLoading(true);
      const startTime = Date.now();

      const response = await axios.post('https://api.piapi.ai/v1/music/tasks', requestData, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const taskId = response.data.task_id;
      
      // Add to history immediately with pending status
      const historyItem: HistoryItemInput = {
        id: taskId,
        prompt: prompt,
        status: 'pending',
        timestamp: startTime,
        tags: `${selectedOptions.voiceType}, ${selectedOptions.genre}, ${selectedOptions.mood}, ${selectedOptions.era}`
      };

      addToHistory(historyItem);
      setPendingCount(prev => prev + 1);

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await axios.get(
            `https://api.piapi.ai/v1/music/tasks/${taskId}`,
            {
              headers: { 'Authorization': `Bearer ${API_KEY}` }
            }
          );

          const { status, output, meta } = statusResponse.data;

          if (status === 'completed') {
            clearInterval(pollInterval);
            setPendingCount(prev => prev - 1);

            // Play success sound
            if (!completedTasksRef.current.has(taskId)) {
              playSuccessBeep();
              completedTasksRef.current.add(taskId);
            }

            // Calculate generation time
            const endTime = meta?.ended_at 
              ? new Date(meta.ended_at).getTime()
              : Date.now();
            const startTimeFromMeta = meta?.started_at 
              ? new Date(meta.started_at).getTime()
              : startTime;

            // Update history with completed status and songs
            updateHistoryItem(taskId, {
              status: 'completed',
              songs: output.songs,
              completedAt: endTime,
              timestamp: startTimeFromMeta
            });

            setNotification({
              type: 'success',
              message: '💝 Your love song has been created!',
              duration: 5000
            });

            setIsLoading(false);
          } else if (status === 'failed') {
            clearInterval(pollInterval);
            setPendingCount(prev => prev - 1);
            
            // Update history with error
            updateHistoryItem(taskId, {
              status: 'failed',
              error: statusResponse.data.error?.message || 'Failed to generate music'
            });

            setNotification({
              type: 'error',
              message: 'Failed to generate song. Please try again.',
              duration: 5000
            });

            setIsLoading(false);
          }
        } catch (error) {
          console.error('Error polling status:', error);
        }
      }, 5000); // Poll every 5 seconds

    } catch (error) {
      setIsLoading(false);
      const errorMessage = getErrorMessage(error);
      
      setNotification({
        type: 'error',
        message: errorMessage,
        duration: 5000
      });

      logError(`Music Generation Error: ${error}`);
    }
  };

  const generateLyrics = async () => {
    if (!APP_ENABLED) {
      setNotification({
        type: 'error',
        message: MAINTENANCE_MESSAGE,
        duration: 5000
      });
      return;
    }

    const { wasFiltered } = profanityFilter.cleanText(lyricsIdea);
    if (wasFiltered) {
      setNotification({
        type: 'error',
        message: 'Please remove inappropriate content before generating lyrics.',
        duration: 5000
      });
      return;
    }

    if (!lyricsIdea.trim() || lyricsIdea.length < MIN_LYRICS_CHARS) {
      setNotification({
        type: 'error',
        message: `Please enter at least ${MIN_LYRICS_CHARS} characters for your lyrics idea`
      });
      return;
    }

    setIsGeneratingLyrics(true);
    try {
      const lyrics = await generateValentineLyrics(lyricsIdea, promptType);
      setPrompt(lyrics);
      setNotification({
        type: 'success',
        message: 'Lyrics generated! You can edit them before creating the song.'
      });
    } catch (error) {
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to generate lyrics'
      });
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  // Add notification effect
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, notification.duration || 3000);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Update the handleSelectChange function
  const handleSelectChange = (field: string, value: string) => {
    try {
      setSelectedOptions(prev => ({ ...prev, [field]: value }));
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      setNotification({
        type: 'error',
        message: 'Failed to update selection. Please try again.'
      });
    }
  };

  // Add a preview button click handler
  const handlePreviewClick = () => {
    // Build description parts
    const descriptionParts = [];
    
    // Add voice type as primary description
    if (selectedOptions.voiceType === 'female_vocals') {
      descriptionParts.push('female vocal', 'female singer', 'female voice');
    } else if (selectedOptions.voiceType === 'male_vocals') {
      descriptionParts.push('male vocal', 'male singer', 'male voice');
    }

    // Add other musical elements
    if (selectedOptions.genre) descriptionParts.push(selectedOptions.genre.toLowerCase());
    if (selectedOptions.mood) descriptionParts.push(selectedOptions.mood.toLowerCase());
    if (selectedOptions.era) descriptionParts.push(selectedOptions.era.toLowerCase());

    const requestData = {
      model: "music-u",
      task_type: "generate_music",
      input: {
        prompt: `[Verse]\n${prompt}`,
        lyrics_type: "user",
        // Add GPT description prompt
        gpt_description_prompt: descriptionParts.join(', '),
        // Add tags
        tags: selectedOptions.voiceType === 'female_vocals' 
          ? 'female_vocals,female_voice,female_singer'
          : 'male_vocals,male_voice,male_singer',
        // Add negative tags
        negative_tags: selectedOptions.voiceType === 'female_vocals'
          ? 'male_vocals,male_voice,male_singer'
          : 'female_vocals,female_voice,female_singer',
        // Force non-instrumental
        make_instrumental: false,
        // Add random seed
        seed: Math.floor(Math.random() * 1000000)
      },
      config: {
        service_mode: "public",
        webhook_config: {
          endpoint: "",
          secret: ""
        }
      }
    };

    setPreviewData({
      isOpen: true,
      request: requestData
    });
  };

  // Add these helper functions for icons
  const getGenreIcon = (genre: string) => {
    const icons: { [key: string]: string } = {
      'pop': '🎵',
      'rock': '🎸',
      'r&b': '🎹',
      'hip-hop': '🎧',
      'jazz': '🎷',
      'classical': '🎼',
      'electronic': '💿'
    };
    return icons[genre] || '🎵';
  };

  const getMoodIcon = (mood: string) => {
    const icons: { [key: string]: string } = {
      'happy': '😊',
      'sad': '😢',
      'energetic': '⚡',
      'calm': '😌',
      'romantic': '💝',
      'melancholic': '🌙'
    };
    return icons[mood] || '💫';
  };

  const getEraIcon = (era: string) => {
    const icons: { [key: string]: string } = {
      '1970s': '🕰️',
      '1980s': '🎸',
      '1990s': '💿',
      '2000s': '📀',
      '2010s': '🎧',
      'modern': '✨'
    };
    return icons[era] || '📅';
  };

  // Update the lyrics idea change handler
  const handleLyricsChange = (text: string) => {
    if (text.length <= MAX_LYRICS_CHARS) {
      const { cleaned, wasFiltered } = profanityFilter.cleanText(text);
      setLyricsIdea(cleaned);
      
      if (wasFiltered && !hasFilteredContent) {
        setHasFilteredContent(true);
        setNotification({
          type: 'warning',
          message: 'Please keep the content family-friendly. Inappropriate words have been removed.',
          duration: 5000
        });
      }
    }
  };

  // Update the prompt change handler
  const handlePromptChange = (text: string) => {
    const { cleaned, wasFiltered } = profanityFilter.cleanText(text);
    setPrompt(cleaned);
    
    if (wasFiltered && !hasFilteredContent) {
      setHasFilteredContent(true);
      setNotification({
        type: 'warning',
        message: 'Please keep the content family-friendly. Inappropriate words have been removed.',
        duration: 5000
      });
    }
  };

  // Add updateHistoryItem function
  const updateHistoryItem = (id: string, updates: Partial<GenerationHistoryItem>) => {
    const newHistory = history.map(item => 
      item.id === id 
        ? { ...item, ...updates }
        : item
    );
    updateHistory(newHistory);
  };

  return (
    <>
      {!APP_ENABLED ? (
        <MaintenanceMessage />
      ) : (
        <>
          <ValentineCaptcha
            isOpen={showCaptcha}
            onSuccess={() => setShowCaptcha(false)}
          />
          
          {!showCaptcha && (
            <div className="min-h-screen py-4 px-2 md:py-8 md:px-4">
              <NotificationComponent 
                notification={notification} 
                onClose={() => setNotification(null)} 
              />
              
              <div className="max-w-2xl mx-auto w-full">
                <div className="text-center mb-6 md:mb-8 relative">
                  <button
                    onClick={() => setShowInfoModal(true)}
                    className="absolute right-0 top-0 text-gray-500 hover:text-pink-500 transition-colors"
                    title="How it works"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <h1 className="text-3xl md:text-4xl font-bold text-red-600 mb-2 flex items-center justify-center gap-2">
                    <HeartIcon className="w-6 h-6 md:w-8 md:h-8" />
                    <span className="hidden md:inline">Valentine's Song Generator</span>
                    <span className="md:hidden">Love Song Maker</span>
                    <HeartIcon className="w-6 h-6 md:w-8 md:h-8" />
                  </h1>
                  <p className="text-sm md:text-base text-gray-600">Create your perfect Valentine's Day song</p>
                </div>

                <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 mb-4 md:mb-6">
                  {/* Step 1: Music Style */}
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <HeartIcon className="w-5 h-5 text-pink-500" />
                      Step 1: Music Style
                    </h2>

                    <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                       {/* Voice Type - 2 columns on all screens */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Voice Type
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <StyleOption
                          label="Female"
                          value="female"
                          selected={selectedOptions.voiceType === 'female'}
                          icon="👩"
                          onChange={(value) => handleSelectChange('voiceType', value)}
                          colorScheme="pink"
                        />
                        <StyleOption
                          label="Male"
                          value="male"
                          selected={selectedOptions.voiceType === 'male'}
                          icon="👨"
                          onChange={(value) => handleSelectChange('voiceType', value)}
                          colorScheme="blue"
                        />
                      </div>
                    </div>

                    {/* Genre - 2 columns on mobile, 3 on tablet, 4 on desktop */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Genre
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {GENRE_OPTIONS.map((option) => (
                          <StyleOption
                            key={option.value}
                            label={option.label}
                            value={option.value}
                            selected={selectedOptions.genre === option.value}
                            icon={getGenreIcon(option.value)}
                            onChange={(value) => handleSelectChange('genre', value)}
                            colorScheme={selectedOptions.voiceType === 'male' ? 'blue' : 'pink'}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Mood - 2 columns on mobile, 3 on tablet, 3 on desktop */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Mood
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {MOOD_OPTIONS.map((option) => (
                          <StyleOption
                            key={option.value}
                            label={option.label}
                            value={option.value}
                            selected={selectedOptions.mood === option.value}
                            icon={getMoodIcon(option.value)}
                            onChange={(value) => handleSelectChange('mood', value)}
                            colorScheme={selectedOptions.voiceType === 'male' ? 'blue' : 'pink'}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Era - 2 columns on mobile, 3 on tablet, 3 on desktop */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Era
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {ERA_OPTIONS.map((option) => (
                          <StyleOption
                            key={option.value}
                            label={option.label}
                            value={option.value}
                            selected={selectedOptions.era === option.value}
                            icon={getEraIcon(option.value)}
                            onChange={(value) => handleSelectChange('era', value)}
                            colorScheme={selectedOptions.voiceType === 'male' ? 'blue' : 'pink'}
                          />
                        ))}
                      </div>
                    </div>
                      </div>
                  </div>

                  {/* Step 2: Lyrics (Optional) */}
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <SparklesIcon className="w-5 h-5 text-pink-500" />
                      Step 2: Song Lyrics
                    </h2>

                    {/* Main Lyrics Input */}
                    <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-6">
                      {/* AI Assistant Toggle */}
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg border border-pink-100">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-pink-500 rounded-full text-white">
                            <SparklesIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-800">AI Lyrics Assistant</h3>
                            <p className="text-sm text-gray-600">Let AI help you write your love song</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showLyricsInput}
                            onChange={(e) => {
                              setShowLyricsInput(e.target.checked);
                              if (!e.target.checked) {
                                setLyricsIdea('');
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
                        </label>
                      </div>

                      {/* AI Generation Section */}
                      {showLyricsInput && (
                        <div className="space-y-4">
                          {/* Style Pills instead of dropdown */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                              Choose Your Style
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {PROMPT_TYPES.map(type => (
                                <button
                                  key={type.value}
                                  onClick={() => setPromptType(type.value as typeof promptType)}
                                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                                    promptType === type.value
                                      ? 'bg-pink-500 text-white shadow-md scale-105'
                                      : 'bg-white text-gray-600 hover:bg-pink-50 hover:text-pink-500 border border-gray-200'
                                  }`}
                                >
                                  {type.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Lyrics Idea Input */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Describe Your Song
                              <span className="text-xs text-gray-500 ml-2">
                                ({MIN_LYRICS_CHARS}-{MAX_LYRICS_CHARS} characters)
                              </span>
                            </label>
                            <div className="relative">
                              <textarea
                                className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent min-h-[120px] shadow-sm"
                                placeholder="What's your love story? Describe the feelings, moments, or memories you want to capture in your song..."
                                value={lyricsIdea}
                                onChange={(e) => handleLyricsChange(e.target.value)}
                                maxLength={MAX_LYRICS_CHARS}
                              />
                              <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs text-gray-500">
                                <span>{lyricsIdea.length}/{MAX_LYRICS_CHARS}</span>
                              </div>
                            </div>
                          </div>

                          {/* Generate Button */}
                          <button
                            onClick={generateLyrics}
                            disabled={isGeneratingLyrics || lyricsIdea.length < MIN_LYRICS_CHARS}
                            className="w-full bg-gradient-to-r from-pink-500 to-red-500 text-white px-6 py-3 rounded-xl hover:from-pink-600 hover:to-red-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 shadow-md"
                          >
                            {isGeneratingLyrics ? (
                              <>
                                <LoadingWave />
                                <span>Creating Your Lyrics...</span>
                              </>
                            ) : (
                              <>
                                <SparklesIcon className="w-5 h-5" />
                                Generate with AI
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Final Lyrics Input */}
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Your Song Lyrics
                          {showLyricsInput && (
                            <span className="text-xs text-gray-500 ml-2">
                              (Feel free to edit the generated lyrics)
                            </span>
                          )}
                        </label>
                        <textarea
                          className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent min-h-[200px] shadow-sm"
                          placeholder={showLyricsInput 
                            ? "Your AI-generated lyrics will appear here. You can edit them before creating your song..."
                            : "Write your song lyrics here..."}
                          value={prompt}
                          onChange={(e) => {
                            if (e.target.value.length <= MAX_LYRICS_CHARS) {
                              handlePromptChange(e.target.value);
                            }
                          }}
                          maxLength={MAX_LYRICS_CHARS}
                        />
                        <div className="mt-1 text-xs text-gray-500 text-right">
                          {prompt.length}/{MAX_LYRICS_CHARS} characters
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Generate Button */}
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <HeartIcon className="w-5 h-5 text-pink-500" />
                      Step 3: Create Your Song
                    </h2>

                    <div className="flex gap-2">
                      <button
                        className="flex-1 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        onClick={generateMusic}
                        disabled={isLoading || pendingCount > 0}
                      >
                        {isLoading ? (
                          <span className="flex items-center gap-2">
                            <LoadingWave />
                            Creating Your Song...
                          </span>
                        ) : pendingCount > 0 ? (
                          <>
                            <LoadingWave />
                            Please wait for current song...
                          </>
                        ) : (
                          <>
                            <HeartIcon className="w-5 h-5" />
                            Create Valentine's Song
                          </>
                        )}
                      </button>
                      
                      <button
                        onClick={handlePreviewClick}
                        className="px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Preview Request/Response"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* History Section */}
                {history.length > 0 && (
                  <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                          <HeartIcon className="w-6 h-6 text-pink-500" />
                          Love Songs History
                        </h3>
                        <span className="px-2 py-1 bg-pink-100 text-pink-600 rounded-full text-sm">
                          {history.length}/{MAX_HISTORY_ITEMS} Songs
                        </span>
                      </div>
                      {history.length > 1 && (
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to clear all history?')) {
                              clearHistory();
                            }
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-pink-600 hover:text-pink-700 hover:bg-pink-50 rounded-full transition-colors text-sm font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Clear All
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      {history.map((item, index) => (
                        <div
                          key={item.id}
                          className="relative bg-white rounded-xl shadow-md border border-pink-100 overflow-hidden group hover:shadow-lg transition-shadow duration-300"
                        >
                          {/* Valentine's themed status bar */}
                          <div className={`absolute top-0 left-0 right-0 h-1 valentine-gradient heart-pattern ${
                            item.status === 'completed' 
                              ? 'bg-pink-500'
                              : item.status === 'failed'
                              ? 'bg-red-500'
                              : 'bg-yellow-500'
                          }`} />
                          
                          {/* Song number badge */}
                          <div className="absolute -left-2 top-3">
                            <div className="relative">
                              <div className="absolute inset-0 transform rotate-45 bg-pink-500" />
                              <span className="relative z-10 px-3 py-1 text-white font-bold">
                                #{history.length - index}
                              </span>
                            </div>
                          </div>

                          <div className="p-4 pt-6">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 ml-8">
                                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                                  {item.prompt}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    item.status === 'completed' 
                                      ? 'bg-pink-100 text-pink-800'
                                      : item.status === 'failed'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {item.status === 'completed' ? '💝 Complete' : 
                                     item.status === 'failed' ? '❌ Failed' : 
                                     '✨ Creating Magic...'}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {new Date(item.timestamp).toLocaleString()}
                                  </span>
                                  {/* Only show duration for completed items with both timestamps */}
                                  {item.status === 'completed' && item.timestamp && item.completedAt && (
                                    <GenerationTime 
                                      startTime={item.timestamp}
                                      endTime={item.completedAt}
                                    />
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => removeFromHistory(item.id)}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                                title="Remove from history"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>

                            {item.songs && item.songs.length > 0 && (
                              <div className="space-y-3 mt-3">
                                {item.songs.map((song) => (
                                  <SongDisplay key={song.id} song={song} />
                                ))}
                              </div>
                            )}

                            {item.status === 'pending' && !item.songs?.length && (
                              <div className="mt-3 flex items-center justify-center p-4 bg-pink-50/50 rounded-lg border border-pink-100">
                                <LoadingWave />
                                <span className="ml-2 text-sm text-pink-600">
                                  Creating your love song...
                                </span>
                              </div>
                            )}

                            {item.status === 'failed' && item.error && (
                              <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                                <p className="text-sm text-red-700">{item.error}</p>
                                {item.error.includes('credit') && (
                                  <a 
                                    href="https://piapi.ai/account"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-red-600 hover:text-red-800 underline mt-1 inline-block"
                                  >
                                    Check Account Balance →
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <PreviewModal
                isOpen={previewData.isOpen}
                onClose={() => setPreviewData({ isOpen: false })}
                request={previewData.request}
                response={previewData.response}
              />
              <InfoModal 
                isOpen={showInfoModal}
                onClose={() => setShowInfoModal(false)}
              />
            </div>
          )}
        </>
      )}
    </>
  );
} 