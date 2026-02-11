/* ============================================
   ViraVozz - JavaScript
   RSS Feed Integration & Interactive Player
   ============================================ */

const CONFIG = {
    RSS_URL: 'https://anchor.fm/s/1004dc564/podcast/rss',
    CORS_PROXY: 'https://api.allorigins.win/raw?url=',
    EPISODES_TO_SHOW: 10
};

// State
let podcastData = null;
let currentPlayingUrl = null;

// DOM Elements
const featuredEpisodeEl = document.getElementById('featured-episode');
const episodesSliderEl = document.getElementById('episodes-slider');
const episodesGridEl = document.getElementById('episodes-grid');
const globalPlayer = document.getElementById('global-player');
const globalPlayBtn = document.getElementById('global-play-btn');
const reproBar = document.getElementById('repro-bar');
const reproTitle = document.getElementById('repro-title');
const globalProgressBar = document.getElementById('global-progress-bar');
const globalProgressContainer = document.getElementById('global-progress');

// ============================================
// Initialization
// ============================================
async function init() {
    // 1. Try to load from cache first for instant display
    const cachedData = localStorage.getItem('viravozz_cache');
    if (cachedData) {
        try {
            podcastData = JSON.parse(cachedData);
            displayData(podcastData);
            console.log("Loaded from cache");
        } catch (e) {
            console.error("Cache error", e);
        }
    }

    // 2. Fetch fresh data from RSS
    const data = await fetchRSSFeed();
    if (!data) return;

    // 3. If data changed or no cache, update display and save cache
    const dataString = JSON.stringify(data);
    if (dataString !== cachedData) {
        podcastData = data;
        displayData(podcastData);
        localStorage.setItem('viravozz_cache', dataString);
        console.log("Cache updated with fresh data");
    }

    setupGlobalPlayer();
}

function displayData(data) {
    const isEpisodesPage = window.location.pathname.includes('episodios');

    if (isEpisodesPage) {
        renderAllEpisodes(data.episodes, data.image);
    } else {
        renderFeaturedEpisode(data.episodes[0], data.image);
        renderEpisodesSlider(data.episodes, data.image);
        setupHeroButton();
    }
}

// ============================================
// RSS Parser
// ============================================
async function fetchRSSFeed() {
    try {
        const response = await fetch(CONFIG.CORS_PROXY + encodeURIComponent(CONFIG.RSS_URL));
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');

        const channel = xml.querySelector('channel');
        const items = xml.querySelectorAll('item');

        const podcast = {
            title: channel.querySelector('title')?.textContent || '',
            image: channel.querySelector('itunes\\:image, image url')?.getAttribute('href') ||
                channel.querySelector('image url')?.textContent || '',
            episodes: []
        };

        items.forEach(item => {
            // Robust image fetching: first check itunes:image, then fallback to podcast image
            // Note: querySelector with namespaces can be tricky, so we use multiple tactics
            let epImage = item.querySelector('itunes\\:image')?.getAttribute('href');
            if (!epImage) {
                // Try looking for tag without namespace if preceding failed
                const images = item.getElementsByTagName('itunes:image');
                if (images.length > 0) epImage = images[0].getAttribute('href');
            }
            if (!epImage) epImage = podcast.image;

            podcast.episodes.push({
                title: item.querySelector('title')?.textContent || '',
                description: cleanDescription(item.querySelector('description')?.textContent || ''),
                pubDate: formatDate(item.querySelector('pubDate')?.textContent),
                duration: item.querySelector('itunes\\:duration, duration')?.textContent || '',
                audioUrl: item.querySelector('enclosure')?.getAttribute('url') || '',
                image: epImage
            });
        });

        return podcast;
    } catch (error) {
        console.error('RSS Error:', error);
        return null;
    }
}

// ============================================
// Render Functions
// ============================================
function renderFeaturedEpisode(episode, podcastImage) {
    if (!featuredEpisodeEl) return;
    featuredEpisodeEl.innerHTML = `
        <img src="${episode.image}" alt="${episode.title}" class="episode-featured-image" onerror="this.src='viravozz-logo.jpg'">
        <div class="episode-featured-content">
            <div class="episode-meta">
                <span>📅 ${episode.pubDate}</span>
                <span>⏱️ ${episode.duration}</span>
            </div>
            <h3>${episode.title}</h3>
            <p class="episode-description">${episode.description}</p>
            <button class="btn btn-primary" onclick="playEpisode('${episode.audioUrl}', '${episode.title}')">
                Reproduzir Episódio
            </button>
        </div>
    `;

    // Update hero image to latest episode image
    const heroImg = document.querySelector('.hero-image');
    if (heroImg) heroImg.src = episode.image;
}

function renderEpisodesSlider(episodes, podcastImage) {
    if (!episodesSliderEl) return;
    // Show 3 episodes after the featured one
    const recentEpisodes = episodes.slice(1, 4);
    episodesSliderEl.innerHTML = recentEpisodes.map(ep => createEpisodeCard(ep)).join('');
}

function renderAllEpisodes(episodes, podcastImage) {
    if (!episodesGridEl) return;
    episodesGridEl.innerHTML = episodes.map(ep => createEpisodeCard(ep)).join('');
}

function createEpisodeCard(episode) {
    return `
        <article class="episode-card">
            <div class="episode-card-image-container">
                <img src="${episode.image}" alt="${episode.title}" class="episode-card-image" onerror="this.src='viravozz-logo.jpg'">
                <button class="card-play-btn" onclick="playEpisode('${episode.audioUrl}', '${episode.title}')">
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
            </div>
            <div class="episode-card-content">
                <h3 class="episode-card-title">${episode.title}</h3>
                <div class="episode-card-meta">${episode.pubDate} • ${episode.duration}</div>
                <p class="episode-card-description">${episode.description.substring(0, 80)}...</p>
            </div>
        </article>
    `;
}

// ============================================
// Player Logic
// ============================================
window.playEpisode = function (url, title) {
    if (!globalPlayer || !reproBar) return;

    const playAudio = () => {
        globalPlayer.play().then(() => {
            console.log("Playback started");
        }).catch(error => {
            console.error("Playback failed:", error);
            // Fallback: show play icon if blocked
            updatePlayIcons();
        });
    };

    if (currentPlayingUrl === url) {
        if (globalPlayer.paused) playAudio();
        else globalPlayer.pause();
    } else {
        currentPlayingUrl = url;
        globalPlayer.src = url;
        reproTitle.textContent = title;
        reproBar.classList.add('active');
        playAudio();
    }
    updatePlayIcons();
};

function setupGlobalPlayer() {
    if (!globalPlayer) return;

    globalPlayBtn?.addEventListener('click', () => {
        if (globalPlayer.paused) {
            globalPlayer.play().catch(e => console.error(e));
        } else {
            globalPlayer.pause();
        }
    });

    globalPlayer.addEventListener('play', updatePlayIcons);
    globalPlayer.addEventListener('pause', updatePlayIcons);

    globalPlayer.addEventListener('timeupdate', () => {
        const progress = (globalPlayer.currentTime / globalPlayer.duration) * 100;
        if (globalProgressBar) globalProgressBar.style.width = `${progress}%`;
    });

    globalProgressContainer?.addEventListener('click', (e) => {
        const rect = globalProgressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        globalPlayer.currentTime = pos * globalPlayer.duration;
    });

    document.getElementById('global-close')?.addEventListener('click', () => {
        reproBar.classList.remove('active');
        globalPlayer.pause();
    });
}

function updatePlayIcons() {
    if (!globalPlayBtn) return;
    globalPlayBtn.textContent = (globalPlayer && !globalPlayer.paused) ? '⏸' : '▶';
}

function setupHeroButton() {
    const heroBtn = document.getElementById('hero-play-btn');
    if (heroBtn && podcastData) {
        heroBtn.addEventListener('click', () => {
            const first = podcastData.episodes[0];
            playEpisode(first.audioUrl, first.title);
        });
    }
}

// ============================================
// Helpers
// ============================================
function cleanDescription(text) {
    const div = document.createElement('div');
    div.innerHTML = text;
    return div.textContent || div.innerText || '';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Start
document.addEventListener('DOMContentLoaded', init);
