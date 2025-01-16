import { PlayIcon, PauseIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { usePlayerStore } from '../store/playerStore';

// Add WhatsApp SVG icon component
function WhatsAppIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

interface CustomMusicPlayerProps {
  src: string;
  title: string;
  tags?: string[];
  onShareEmail?: () => void;
  onShareWhatsApp?: () => void;
}

export function CustomMusicPlayer({ 
  src, 
  title,
  tags = [],
  onShareEmail,
  onShareWhatsApp
}: CustomMusicPlayerProps) {
  const { currentSong, isPlaying, setCurrentSong, setIsPlaying } = usePlayerStore();

  const isCurrentSong = currentSong?.url === src;

  const handlePlay = () => {
    if (isCurrentSong) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentSong({ url: src, title });
      setIsPlaying(true);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      <div className="p-4 flex items-center gap-4">
        <button
          onClick={handlePlay}
          className="group relative"
        >
          <span className="w-10 h-10 flex items-center justify-center rounded-full bg-pink-500 text-white shadow-lg transform group-hover:scale-110 transition-transform">
            {isCurrentSong && isPlaying ? (
              <PauseIcon className="w-5 h-5" />
            ) : (
              <PlayIcon className="w-5 h-5 ml-0.5" />
            )}
          </span>
        </button>

        <div className="flex-1">
          <h3 className="font-medium text-gray-900 mb-1">{title}</h3>
          <div className="flex flex-wrap gap-1">
            {tags.map(tag => (
              <span 
                key={tag} 
                className="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-600"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {onShareEmail && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const songData = {
                  url: src,
                  title: title || 'Love Song',
                  sender: "A Valentine's Friend"
                };
                const encodedData = btoa(JSON.stringify(songData));
                const playPageUrl = `${window.location.origin}/lyrics-to-song/#/play/${encodedData}`;
                console.log('Generated play page URL:', playPageUrl);
                onShareEmail();
              }}
              className="p-2 rounded-full text-gray-400 hover:text-pink-600 hover:bg-pink-50 transition-colors"
              title="Share via Email"
            >
              <EnvelopeIcon className="w-5 h-5" />
            </button>
          )}
          {onShareWhatsApp && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const songData = {
                  url: src,
                  title: title || 'Love Song',
                  sender: "A Valentine's Friend"
                };
                const encodedData = btoa(JSON.stringify(songData));
                const playPageUrl = `${window.location.origin}/lyrics-to-song/#/play/${encodedData}`;
                console.log('Generated WhatsApp share URL:', playPageUrl);
                onShareWhatsApp();
              }}
              className="p-2 rounded-full text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
              title="Share via WhatsApp"
            >
              <WhatsAppIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
} 