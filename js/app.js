// Main Application Entry Point



// Theme Toggle Logic
const themeToggle = document.getElementById('theme-toggle');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

const currentTheme = localStorage.getItem('theme');
if (currentTheme == 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
} else if (currentTheme == 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
}

themeToggle.addEventListener('click', function () {
    let theme = 'light';
    if (document.documentElement.getAttribute('data-theme') === 'light') {
        document.documentElement.setAttribute('data-theme', 'dark');
        theme = 'dark';
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('theme', theme);
});

// Mobile Menu Toggle
const menuToggle = document.getElementById('menu-toggle');
const navLinks = document.querySelector('.nav-links');

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });

    // Close menu when a link is clicked
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
        });
    });
}

// Router and Content Loading
const routes = {
    '/': renderHome,
    '/search': renderSearch,
    '/generate': renderGenerate,
    '/about': renderAbout
};

const mainContent = document.getElementById('main-content');
let songsData = [];
// selectedSongs is now an Array of objects: { title: string, keyIndex: number }
let selectedSongs = [];

async function loadSongs() {
    if (songsData.length === 0) {
        try {
            const response = await fetch('data/songs.json?timestamp=' + new Date().getTime());
            songsData = await response.json();
        } catch (error) {
            console.error('Error loading songs:', error);
        }
    }
}

let carouselInterval = null;

async function handleNavigation() {
    // Clear any existing carousel interval
    if (carouselInterval) {
        clearInterval(carouselInterval);
        carouselInterval = null;
    }

    const hash = window.location.hash.slice(1) || '/';


    // Simple route matching
    let routeHandler = routes[hash];

    // Handle parameterized routes (e.g., song details)
    if (!routeHandler && hash.startsWith('/song/')) {
        routeHandler = () => renderSongDetail(hash);
    }

    if (routeHandler) {
        await routeHandler();
    } else {
        renderNotFound();
    }

    // Update active nav link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${hash}`) {
            link.classList.add('active');
        }
    });
}

function renderHome() {
    mainContent.innerHTML = `
        <section class="hero-carousel-section">
            <div class="carousel-container">
                <div class="carousel-inner" id="carousel-inner">
                    <!-- Items injected via JS -->
                </div>
                <button class="carousel-control prev" id="carousel-prev" aria-label="Previous Slide">❮</button>
                <button class="carousel-control next" id="carousel-next" aria-label="Next Slide">❯</button>
                <div class="carousel-indicators" id="carousel-indicators"></div>
            </div>
        </section>

        <section class="features-section" style="margin-top: 2rem;">
            <div class="features-grid">
                <a href="#/search" class="feature-card">
                    <h3>Browse Songs</h3>
                    <p>Search our comprehensive repertoire of praise songs.</p>
                    <span class="btn btn-primary btn-sm">Search Now</span>
                </a>
                <a href="#/generate" class="feature-card">
                    <h3>Generate Charts</h3>
                    <p>Create and download custom chord charts for your setlist.</p>
                    <span class="btn btn-secondary btn-sm">Create Setlist</span>
                </a>
            </div>
        </section>
    `;

    initCarousel();
}

const carouselData = [
    {
        img: 'https://ryan2706.github.io/GEAR/banner---piano.jpg',
        verse: '"Sing to him a new song; play skillfully, and shout for joy."',
        ref: 'Psalm 33:3'
    },
    {
        img: 'https://ryan2706.github.io/GEAR/banner---drumsticks.jpg',
        verse: '"All the nations you have made will come and worship before you, Lord; they will bring glory to your name. For you are great and do marvelous deeds; you alone are God."',
        ref: 'Psalm 86:9-10'
    },
    {
        img: 'https://ryan2706.github.io/GEAR/banner---electricGuitar.jpg',
        verse: '"All the earth worships you and sings praises to you; they sing praises to your name."',
        ref: 'Psalm 66:4'
    }
];

function initCarousel() {
    const track = document.getElementById('carousel-inner');
    const indicators = document.getElementById('carousel-indicators');
    if (!track) return;

    let currentIndex = 0;

    // Render Items
    track.innerHTML = carouselData.map((item, index) => `
        <div class="carousel-item ${index === 0 ? 'active' : ''}" style="background-image: url('${item.img}')">
            <div class="carousel-overlay">
                <div class="carousel-text">
                    <blockquote>${item.verse}</blockquote>
                    <cite>${item.ref}</cite>
                </div>
            </div>
        </div>
    `).join('');

    // Render Indicators
    indicators.innerHTML = carouselData.map((_, index) => `
        <button class="indicator ${index === 0 ? 'active' : ''}" data-index="${index}" aria-label="Slide ${index + 1}"></button>
    `).join('');

    const updateCarousel = () => {
        const items = track.querySelectorAll('.carousel-item');
        const dots = indicators.querySelectorAll('.indicator');

        items.forEach((item, i) => {
            item.classList.toggle('active', i === currentIndex);
        });
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
        });
    };

    const nextSlide = () => {
        currentIndex = (currentIndex + 1) % carouselData.length;
        updateCarousel();
    };

    const prevSlide = () => {
        currentIndex = (currentIndex - 1 + carouselData.length) % carouselData.length;
        updateCarousel();
    };

    document.getElementById('carousel-next').addEventListener('click', () => {
        nextSlide();
        resetTimer();
    });

    document.getElementById('carousel-prev').addEventListener('click', () => {
        prevSlide();
        resetTimer();
    });

    indicators.querySelectorAll('.indicator').forEach(dot => {
        dot.addEventListener('click', (e) => {
            currentIndex = parseInt(e.target.dataset.index);
            updateCarousel();
            resetTimer();
        });
    });

    const startTimer = () => {
        carouselInterval = setInterval(nextSlide, 6000); // 6 seconds
    };

    const resetTimer = () => {
        clearInterval(carouselInterval);
        startTimer();
    };

    startTimer();
}

async function renderSearch() {
    await loadSongs();
    mainContent.innerHTML = `
        <section class="search-page">
            <h1>Search Songs</h1>
            <input type="text" id="search-input" placeholder="Search by title..." class="search-input">
            <div id="song-list" class="song-list">
                ${renderSongList(songsData)}
            </div>
        </section>
    `;

    document.getElementById('search-input').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filteredSongs = songsData.filter(song => song.title.toLowerCase().includes(query));
        document.getElementById('song-list').innerHTML = renderSongList(filteredSongs);
    });

    // Add event listeners for checkboxes
    document.getElementById('song-list').addEventListener('change', async (e) => {
        if (e.target.type === 'checkbox') {
            const title = e.target.value;
            if (e.target.checked) {
                // Check if already in list
                if (!selectedSongs.some(s => s.title === title)) {
                    // Fetch song to get original key
                    const song = songsData.find(s => s.title === title);
                    if (song) {
                        await fetchSongContent(song);
                        selectedSongs.push({ title: title, keyIndex: song.originalKeyIndex !== undefined ? song.originalKeyIndex : 0 });
                    }
                }
            } else {
                selectedSongs = selectedSongs.filter(s => s.title !== title);
            }
        }
    });
}

function renderSongList(songs) {
    if (songs.length === 0) return '<p>No songs found.</p>';
    return songs.map(song => `
        <div class="song-item-container">
            <input type="checkbox" id="song-${song.title}" value="${song.title}" ${selectedSongs.some(s => s.title === song.title) ? 'checked' : ''}>
            <a href="#/song/${encodeURIComponent(song.title)}" class="song-item" data-url="${song.url}">
                ${song.title}
            </a>
        </div>
    `).join('');
}

// Helper to fetch and parse song content
async function fetchSongContent(song) {
    if (song.originalContent) return; // Already loaded

    try {
        const response = await fetch(song.url);
        if (!response.ok) throw new Error('Content not found');
        let html = await response.text();

        // Extract content inside <pre> tags
        let content = html;
        let originalKeyStr = null;

        // Try to match pre with data-key
        const preMatchWithKey = html.match(/<pre[^>]*data-key="([^"]+)"[^>]*>(.*?)<\/pre>/s);
        if (preMatchWithKey) {
            originalKeyStr = preMatchWithKey[1];
            content = preMatchWithKey[2];
        } else if (html.match(/<pre[^>]*>(.*?)<\/pre>/s)) {
            content = html.match(/<pre[^>]*>(.*?)<\/pre>/s)[1];
        }

        song.originalContent = content;

        // Detect Key
        if (originalKeyStr) {
            let index = NOTES.indexOf(originalKeyStr);
            if (index === -1) index = NOTES_FLAT.indexOf(originalKeyStr);
            song.originalKeyIndex = index !== -1 ? index : detectKey(content);
        } else {
            song.originalKeyIndex = detectKey(content);
        }

        // If currentKeyIndex wasn't set (e.g. added from search), set it to original
        if (song.currentKeyIndex === undefined) {
            song.currentKeyIndex = song.originalKeyIndex;
        }

    } catch (error) {
        console.error("Error fetching song content:", error);
        song.originalContent = "Error loading content: " + song.url;
        song.originalKeyIndex = 0;
    }
}

async function renderSongDetail(hash) {
    const title = decodeURIComponent(hash.split('/song/')[1]);
    await loadSongs();
    const song = songsData.find(s => s.title === title);

    if (!song) {
        renderNotFound();
        return;
    }

    mainContent.innerHTML = `
        <section class="song-detail">
            <h1>${song.title}</h1>
            <div class="loading">Loading chart...</div>
        </section>
    `;

    await fetchSongContent(song);

    // If we have a stored key for this song in selectedSongs, use it
    const storedSong = selectedSongs.find(s => s.title === song.title);
    if (storedSong) {
        song.currentKeyIndex = storedSong.keyIndex;
    } else {
        song.currentKeyIndex = song.originalKeyIndex;
    }

    renderSongContent(song);
}

function renderSongContent(song) {
    // Calculate semitones difference
    let semitones = song.currentKeyIndex - song.originalKeyIndex;

    let transposedContent = transposeText(song.originalContent, semitones);

    // Style Section Headers
    // Matches [Intro], [Verse 1], etc.
    const headerRegex = /\[((?:Intro|Verse|Pre-Chorus|Chorus|Bridge|Interlude|Tag|Ending|Coda|Outro).*?)\]/gi;
    transposedContent = transposedContent.replace(headerRegex, '<span class="section-header">[$1]</span>');

    // Generate Key Options
    const KEY_DISPLAY = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    const options = KEY_DISPLAY.map((key, index) => {
        const selected = index === song.currentKeyIndex ? 'selected' : '';
        return `<option value="${index}" ${selected}>${key}</option>`;
    }).join('');

    document.querySelector('.song-detail').innerHTML = `
        <h1>${song.title}</h1>
        <div class="transposition-controls">
            <label for="key-select" style="font-weight: 600; margin-right: 0.5rem;">Key:</label>
            <select id="key-select" onchange="changeKey('${song.title.replace(/'/g, "\\'")}', this.value)" class="key-select">
                ${options}
            </select>
        </div>
        <div class="song-content">
            <pre>${transposedContent}</pre>

            <p style="margin-top: 1rem; font-size: 0.8rem; color: var(--text-muted); text-align: center;">
                ${song.title} is the copyrighted property of its owner(s).
            </p>
        </div>
        <div class="action-buttons" style="margin-top: 1rem; display: flex; gap: 1rem;">
            <button onclick="window.history.back()" class="btn btn-secondary">Back</button>
            <button onclick="addToSetlist('${song.title.replace(/'/g, "\\'")}', ${song.currentKeyIndex})" class="btn btn-primary">Add to Setlist</button>
        </div>
    `;
}

window.changeKey = (title, newKeyIndex) => {
    const song = songsData.find(s => s.title === title);
    if (song) {
        song.currentKeyIndex = parseInt(newKeyIndex);
        // If in setlist, update the stored key
        const storedSong = selectedSongs.find(s => s.title === title);
        if (storedSong) {
            storedSong.keyIndex = song.currentKeyIndex;
        }
        renderSongContent(song);
    }
};

// Transposition Logic
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function detectKey(text) {
    // Find the first valid chord
    const chordRegex = /\b([A-G](?:#|b)?)(m|maj|min|dim|aug|sus|add|7|9|11|13)*(\/[A-G](?:#|b)?)?\b/;
    const match = text.match(chordRegex);

    if (match) {
        let root = match[1];
        let index = NOTES.indexOf(root);
        if (index === -1) index = NOTES_FLAT.indexOf(root);
        if (index !== -1) return index;
    }
    return 0; // Default to C if detection fails
}

function transposeText(text, semitones) {
    const lines = text.split('\n');

    // Regex for strict validation of a single token as a chord
    const strictChordRegex = /^([A-G](?:#|b)?)((?:m|maj|min|dim|aug|sus|add|M|2|4|5|6|7|9|11|13)*)(\/[A-G](?:#|b)?)?$/;

    // Regex for finding/replacing chords within a confirmed chord line
    const chordRegex = /\b([A-G](?:#|b)?)((?:m|maj|min|dim|aug|sus|add|M|2|4|5|6|7|9|11|13)*)(\/[A-G](?:#|b)?)?(?=\s|$)/g;

    return lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // Check if the line is a "chord line"
        // A chord line should consist ONLY of valid chords (and spaces)
        // We split by whitespace to check each token
        const tokens = trimmed.split(/\s+/);

        // Allow some common non-chord tokens in chord lines if needed, 
        // but for now, strict check is safest to avoid "A" in lyrics.
        const isChordLine = tokens.every(token => strictChordRegex.test(token));

        if (isChordLine) {
            return line.replace(chordRegex, (match, root, suffix, bass) => {
                // Transpose root
                let newRoot = transposeNote(root, semitones);

                // Transpose bass if present
                let newBass = bass ? '/' + transposeNote(bass.substring(1), semitones) : '';

                const chordName = newRoot + (suffix || '') + newBass;
                return `<span class="chord" data-chord="${chordName}">${chordName}</span>`;
            });
        } else {
            return line; // Return lyrics as-is
        }
    }).join('\n');
}

function transposeNote(note, semitones) {
    let index = NOTES.indexOf(note);
    if (index === -1) {
        index = NOTES_FLAT.indexOf(note);
    }
    if (index === -1) return note; // Not a note

    let newIndex = (index + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    // Prefer sharps for now, or could be smarter based on key
    return NOTES[newIndex];
}


// Helper to add from detail page
window.addToSetlist = (title, keyIndex) => {
    if (!selectedSongs.some(s => s.title === title)) {
        selectedSongs.push({ title: title, keyIndex: keyIndex });
        alert(`Added "${title}" to setlist!`);
    } else {
        // Update key if already exists
        const storedSong = selectedSongs.find(s => s.title === title);
        storedSong.keyIndex = keyIndex;
        alert(`Updated "${title}" in setlist!`);
    }
};

// Helper to add song with fetch for original key
async function addSongToSetlist(title) {
    const song = songsData.find(s => s.title === title);
    if (!song) return;
    await fetchSongContent(song);
    // Ensure we don't add duplicates if already present
    if (!selectedSongs.some(s => s.title === title)) {
        selectedSongs.push({ title: title, keyIndex: song.originalKeyIndex });
    } else {
        // If it exists, just update its key to original
        const storedSong = selectedSongs.find(s => s.title === title);
        storedSong.keyIndex = song.originalKeyIndex;
    }
}

async function renderGenerate() {
    // Ensure we have songs loaded
    await loadSongs();

    const KEY_DISPLAY = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    mainContent.innerHTML = `
        <section class="generate-page">
            <h1>Generate Chord Chart</h1>
            
            <div class="add-song-wrapper">
                <input type="text" id="add-song-input" placeholder="Search to add song..." class="search-input" style="margin-bottom: 0;">
                <ul id="add-song-suggestions" class="suggestions-list hidden"></ul>
            </div>

            <p>Selected Songs: ${selectedSongs.length}</p>
            <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">Drag and drop to reorder songs.</p>
            ${selectedSongs.length > 0 ? `
                <ul class="selected-list" id="sortable-list">
                    ${selectedSongs.map((song, index) => {
        const options = KEY_DISPLAY.map((key, kIndex) => {
            const selected = kIndex === song.keyIndex ? 'selected' : '';
            return `<option value="${kIndex}" ${selected}>${key}</option>`;
        }).join('');

        return `
                        <li draggable="true" data-index="${index}" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; cursor: grab; background: var(--bg-card); padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border-color);">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span style="color: var(--text-muted); cursor: grab;">☰</span>
                                <span>${song.title}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <select onchange="updateSetlistKey('${song.title}', this.value)" class="key-select" style="padding: 0.25rem;">
                                    ${options}
                                </select>
                                <button onclick="removeFromSetlist('${song.title}')" class="remove-btn">x</button>
                            </div>
                        </li>`;
    }).join('')}
                </ul>
                <button onclick="generateDoc()" class="btn btn-primary" style="margin-top: 1rem;">Download Word Doc</button>
            ` : '<p>No songs selected. Go to <a href="#/search">Search</a> to add songs.</p>'}
        </section>
    `;

    // Event Listeners for Add Song
    const input = document.getElementById('add-song-input');
    const suggestionsList = document.getElementById('add-song-suggestions');

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (!query) {
            suggestionsList.classList.add('hidden');
            return;
        }

        const matches = songsData.filter(s => s.title.toLowerCase().includes(query) && !selectedSongs.some(sel => sel.title === s.title)).slice(0, 10);

        if (matches.length > 0) {
            suggestionsList.innerHTML = matches.map(s => `
                <li data-title="${s.title}">${s.title}</li>
            `).join('');
            suggestionsList.classList.remove('hidden');

            suggestionsList.querySelectorAll('li').forEach(li => {
                li.addEventListener('click', async () => {
                    const title = li.getAttribute('data-title');
                    input.value = '';
                    suggestionsList.classList.add('hidden');
                    await addSongToSetlist(title);
                    renderGenerate();
                });
            });
        } else {
            suggestionsList.classList.add('hidden');
        }
    });

    // Add Drag and Drop Listeners
    const list = document.getElementById('sortable-list');
    if (list) {
        let draggedItem = null;

        list.addEventListener('dragstart', (e) => {
            draggedItem = e.target;
            e.dataTransfer.effectAllowed = 'move';
            e.target.style.opacity = '0.5';
        });

        list.addEventListener('dragend', (e) => {
            e.target.style.opacity = '1';
            draggedItem = null;
            // Re-render to ensure state matches DOM (optional, but good for consistency)
            // Actually, we need to update the array based on new DOM order if we didn't update array during drag
            // Let's update array on drop/dragover instead.
        });

        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(list, e.clientY);
            const currentItem = draggedItem;
            if (afterElement == null) {
                list.appendChild(currentItem);
            } else {
                list.insertBefore(currentItem, afterElement);
            }
        });

        // On drop (or rather, when drag ends), we need to update the selectedSongs array to match the new DOM order
        list.addEventListener('drop', (e) => {
            e.preventDefault();
            updateArrayFromDOM();
        });

        // Mobile Touch Events
        let touchDraggedItem = null;

        list.addEventListener('touchstart', (e) => {
            const li = e.target.closest('li');
            if (li && list.contains(li)) {
                touchDraggedItem = li;
                // Optional: visual feedback
                li.style.opacity = '0.5';
            }
        }, { passive: false });

        list.addEventListener('touchmove', (e) => {
            if (!touchDraggedItem) return;
            e.preventDefault(); // Prevent scrolling while dragging

            const touch = e.touches[0];
            const afterElement = getDragAfterElement(list, touch.clientY);

            if (afterElement == null) {
                list.appendChild(touchDraggedItem);
            } else {
                list.insertBefore(touchDraggedItem, afterElement);
            }
        }, { passive: false });

        list.addEventListener('touchend', (e) => {
            if (touchDraggedItem) {
                touchDraggedItem.style.opacity = '1';
                touchDraggedItem = null;
                updateArrayFromDOM();
            }
        });
    }
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateArrayFromDOM() {
    const listItems = document.querySelectorAll('#sortable-list li');
    const newOrder = [];
    listItems.forEach(item => {
        const title = item.querySelector('span:nth-child(2)').innerText; // 2nd span is title
        // Find the song object in the old array to preserve keyIndex
        const songObj = selectedSongs.find(s => s.title === title);
        if (songObj) {
            newOrder.push(songObj);
        }
    });
    selectedSongs = newOrder;
    // No need to re-render immediately as DOM is already correct, but good practice to ensure sync
    // renderGenerate(); 
}

window.updateSetlistKey = (title, newKeyIndex) => {
    const song = selectedSongs.find(s => s.title === title);
    if (song) {
        song.keyIndex = parseInt(newKeyIndex);
    }
};

window.removeFromSetlist = (title) => {
    selectedSongs = selectedSongs.filter(s => s.title !== title);
    renderGenerate();
};

window.generateDoc = async () => {
    if (selectedSongs.length === 0) return;

    // Show loading state
    const btn = document.querySelector('.generate-page .btn-primary');
    const originalText = btn.innerText;
    btn.innerText = 'Generating...';
    btn.disabled = true;

    try {
        if (!window.docx) {
            throw new Error("docx library not loaded. Please check your internet connection.");
        }

        const { Document, Packer, Paragraph, TextRun, SectionType, ColumnBreak } = window.docx;
        const children = [];

        // Title Paragraph


        for (const songObj of selectedSongs) {
            const title = songObj.title;
            const song = songsData.find(s => s.title === title);
            if (song) {
                await fetchSongContent(song);
                const targetKeyIndex = songObj.keyIndex;

                // If fetchSongContent failed to get originalKeyIndex (e.g. error), default to 0
                const originalKeyIndex = song.originalKeyIndex !== undefined ? song.originalKeyIndex : 0;
                const semitones = targetKeyIndex - originalKeyIndex;

                // Transpose
                let transposed = transposeText(song.originalContent, semitones);

                // Get Key Name
                const KEY_DISPLAY = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
                const keyName = KEY_DISPLAY[targetKeyIndex];

                // Song Title
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: `${title} [${keyName}]`.toUpperCase(),
                            bold: true,
                            size: 24, // 12pt
                            font: "Courier New"
                        })
                    ],
                    spacing: { before: 400, after: 200 },
                    keepNext: true
                }));

                // Process lines
                const lines = transposed.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        children.push(new Paragraph({ children: [] })); // Empty line
                        continue;
                    }

                    // Check for Section Header
                    const headerMatch = trimmed.match(/^\[((?:Intro|Verse|Pre-Chorus|Chorus|Bridge|Interlude|Tag|Ending|Coda|Outro).*?)\]$/i);
                    if (headerMatch) {
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: trimmed,
                                    bold: true,
                                    font: "Courier New",
                                    size: 24 // 12pt
                                })
                            ],
                            spacing: { before: 100, after: 0 }
                        }));
                        continue;
                    }

                    // Check for Chords (using the same strict regex logic or parsing the HTML from transposeText)
                    // Since transposeText returns HTML with spans, we should parse that!
                    // But wait, transposeText returns a string with HTML tags. 
                    // Let's re-run the logic or parse the string. 
                    // Parsing the string is safer to match exactly what is shown.

                    // Simple parser for <span class="chord">...</span> and <span class="section-header">...</span>
                    // Note: transposeText output might contain multiple spans in one line.

                    const runs = [];
                    let lastIndex = 0;
                    const tagRegex = /<span class="([^"]+)"[^>]*>([^<]+)<\/span>/g;
                    let match;

                    while ((match = tagRegex.exec(line)) !== null) {
                        // Text before the tag
                        if (match.index > lastIndex) {
                            runs.push(new TextRun({
                                text: line.substring(lastIndex, match.index),
                                font: "Courier New",
                                size: 24
                            }));
                        }

                        const type = match[1]; // "chord" or "section-header"
                        const content = match[2];

                        if (type === 'chord') {
                            runs.push(new TextRun({
                                text: content,
                                bold: true,
                                color: "0000FF", // Blue
                                font: "Courier New",
                                size: 24
                            }));
                        } else if (type === 'section-header') {
                            runs.push(new TextRun({
                                text: content,
                                bold: true,
                                color: "000000",
                                font: "Courier New",
                                size: 24
                            }));
                        }

                        lastIndex = tagRegex.lastIndex;
                    }

                    // Remaining text
                    if (lastIndex < line.length) {
                        runs.push(new TextRun({
                            text: line.substring(lastIndex),
                            font: "Courier New",
                            size: 24
                        }));
                    }

                    children.push(new Paragraph({
                        children: runs,
                        spacing: { after: 0 }
                    }));
                }



                children.push(new Paragraph({ children: [] }));
            }
        }

        const doc = new Document({
            sections: [{
                properties: {
                    column: {
                        count: 2,
                        space: 708, // ~0.5 inch
                    },
                    page: {
                        margin: {
                            top: 720, // 0.5 inch
                            right: 720,
                            bottom: 720,
                            left: 720
                        }
                    }
                },
                children: children
            }]
        });

        const blob = await Packer.toBlob(doc);
        const newBlob = new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

        // Manual download fallback to ensure filename is respected
        const url = window.URL.createObjectURL(newBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "Setlist.docx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Error generating doc:", error);
        alert(`Error generating document: ${error.message}`);
    } finally {
        // Reset button
        btn.innerText = originalText;
        btn.disabled = false;
    }
};


function renderAbout() {
    mainContent.innerHTML = `
        <section class="about-page">
            <h1 style="text-align: center; margin-bottom: 2rem;">About GEAR</h1>
            
            <div class="about-container">
                <!-- About Site Card -->
                <div class="about-card">
                    <h2>The Project</h2>
                    <p>My name is <strong>Ryan</strong>. This site is developed by me as a personal project for the praise ministry of <strong>Church Of the True Light (COTL)</strong>, where I currently serve.</p>
                    <p>The purpose of this site is to host our repertoire of praise songs.</p>
                    
                    <div class="alert-box">
                        <strong>Note:</strong> All songs hosted on this site do not belong to me. They are the copyrighted properties of their owner(s).
                    </div>

                    <h3>Developer's Comment</h3>
                    <p>This site is developed using only client-side technologies (HTML5, JavaScript, and CSS).</p>
                    <p>If you are a web developer and would like to participate in this project, or if you find errors in a chord chart, feel free to contact me at <a href="mailto:rock2706@hotmail.com">rock2706@hotmail.com</a>.</p>
                </div>

                <!-- COTL Card -->
                <div class="about-card">
                    <h2>Church Of the True Light</h2>
                    <p>
                        25G Perak Road<br>
                        Singapore 208142
                    </p>
                    <p>
                        <strong>Phone:</strong> +65 6294 0797<br>
                        <strong>Email:</strong> <a href="mailto:mail@truelight.org.sg">mail@truelight.org.sg</a><br>
                        <strong>Website:</strong> <a href="https://www.truelight.org.sg/" target="_blank">www.truelight.org.sg</a>
                    </p>
                    
                    <div style="margin-top: 1.5rem; text-align: center;">
                        <a href="https://www.truelight.org.sg/service-timings/" target="_blank" class="btn btn-secondary" style="margin-bottom: 1rem;">View Service Timings</a>
                    </div>
                    
                    <!-- Google Map -->
                    <div style="width: 100%; height: 300px; border-radius: 0.5rem; overflow: hidden; border: 1px solid var(--border-color);">
                        <iframe width="100%" height="100%" src="https://maps.google.com/maps?q=Church+Of+the+True+Light+Singapore&t=&z=15&ie=UTF8&iwloc=&output=embed" frameborder="0" scrolling="no" marginheight="0" marginwidth="0"></iframe>
                    </div>
                </div>

                <!-- Acknowledgements Card -->
                <div class="about-card full-width">
                    <h3>Acknowledgements</h3>
                    <ul class="credit-list">
                        <li>Transposition logic inspired by <strong>jQuery Chord Transpose Plugin</strong> by Jesse Gavin.</li>
                        <li><strong>docx</strong> library for document generation.</li>
                        <li><strong>Note:</strong> This modern version (GEAR 3) uses Vanilla JS and custom CSS, moving away from Bootstrap/jQuery dependencies of the original.</li>
                        <li>Gear icon designed by <strong>Freepik</strong>.</li>
                    </ul>
                </div>
            </div>
        </section>
    `;
}

function renderNotFound() {
    mainContent.innerHTML = `
        <section class="error-page">
            <h1>404</h1>
            <p>Page not found.</p>
            <a href="#/" class="btn btn-primary">Go Home</a>
        </section>
    `;
}

window.addEventListener('hashchange', handleNavigation);
window.addEventListener('load', handleNavigation);

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
    const input = document.getElementById('add-song-input');
    const suggestionsList = document.getElementById('add-song-suggestions');
    if (input && suggestionsList && !input.contains(e.target) && !suggestionsList.contains(e.target)) {
        suggestionsList.classList.add('hidden');
    }
});

// ==========================================
// CHORD HOVER & SVG GENERATION LOGIC
// ==========================================

// Standard EADGBE tuning
// Format: [E2, A2, D3, G3, B3, E4]
// -1 = x (muted), 0 = open, >0 = fret number
const CHORD_FINGERINGS = {
    // Open Majors
    "C": [-1, 3, 2, 0, 1, 0],
    "D": [-1, -1, 0, 2, 3, 2],
    "E": [0, 2, 2, 1, 0, 0],
    "F": [1, 3, 3, 2, 1, 1], // Barre
    "G": [3, 2, 0, 0, 0, 3], // or [3, 2, 0, 0, 3, 3]
    "A": [-1, 0, 2, 2, 2, 0],
    "B": [-1, 2, 4, 4, 4, 2], // Barre

    // Open Minors
    "Cm": [-1, 3, 5, 5, 4, 3], // Barre
    "C#m": [-1, 4, 6, 6, 5, 4],
    "Dm": [-1, -1, 0, 2, 3, 1],
    "Em": [0, 2, 2, 0, 0, 0],
    "Fm": [1, 3, 3, 1, 1, 1],
    "F#m": [2, 4, 4, 2, 2, 2],
    "Gm": [3, 5, 5, 3, 3, 3],
    "Am": [-1, 0, 2, 2, 1, 0],
    "Bm": [-1, 2, 4, 4, 3, 2],

    // 7ths
    "G7": [3, 2, 0, 0, 0, 1],
    "C7": [-1, 3, 2, 3, 1, 0],
    "D7": [-1, -1, 0, 2, 1, 2],
    "E7": [0, 2, 0, 1, 0, 0],
    "A7": [-1, 0, 2, 0, 2, 0],
    "B7": [-1, 2, 1, 2, 0, 2],

    // Major 7ths
    "Cmaj7": [-1, 3, 2, 0, 0, 0],
    "Fmaj7": [-1, -1, 3, 2, 1, 0],
    "Gmaj7": [3, 2, 0, 0, 0, 2],

    // Minor 7ths
    "Em7": [0, 2, 2, 0, 3, 0], // or [0, 2, 0, 0, 0, 0]
    "Am7": [-1, 0, 2, 0, 1, 0],
    "Dm7": [-1, -1, 0, 2, 1, 1],
    "Gm7": [3, 5, 3, 3, 3, 3], // Barre
    "Bm7": [-1, 2, 0, 2, 0, 2], // or Barre [-1, 2, 4, 2, 3, 2]

    // Sus / Add
    "Dsus4": [-1, -1, 0, 2, 3, 3],
    "Dsus": [-1, -1, 0, 2, 3, 3],
    "Gsus4": [3, 2, 0, 0, 1, 3], // Tricky, often x 3 0 0 1 3 or 3 x 0 0 1 3
    "Gsus": [3, 2, 0, 0, 1, 3],
    "Asus4": [-1, 0, 2, 2, 3, 0],
    "Asus": [-1, 0, 2, 2, 3, 0],
    "Esus4": [0, 2, 2, 2, 0, 0],
    "Esus": [0, 2, 2, 2, 0, 0],
    "Csus4": [-1, 3, 3, 0, 1, 1],
    "Csus": [-1, 3, 3, 0, 1, 1],
    "Fsus4": [1, 3, 3, 3, 1, 1], // Barre
    "Fsus": [1, 3, 3, 3, 1, 1],
    "Bsus4": [-1, 2, 4, 4, 0, 0], // Bsus4 open-ish or barre [-1, 2, 4, 4, 5, 2]
    "Bsus": [-1, 2, 4, 4, 0, 0],
    "Cadd9": [-1, 3, 2, 0, 3, 0], // or [-1, 3, 2, 0, 3, 3]

    // Slash Chords
    "G/B": [-1, 2, 0, 0, 0, 3], // or [-1, 2, 0, 0, 3, 3]
    "C/E": [0, 3, 2, 0, 1, 0],
    "D/F#": [2, 0, 0, 2, 3, 2], // Thumb over
    "A/C#": [-1, 4, 2, 2, 2, 0],
    "E/G#": [4, 2, 2, 1, 0, 0], // often played as [4, 7, 6, 4, 5, 4] barre, but open variant harder. 
    // Let's us specific shapings for simple ones
    "F/A": [-1, 0, 3, 2, 1, 1],
    "Bb/D": [-1, -1, 0, 3, 3, 1],
    "Dsus/F#": [2, 0, 0, 2, 3, 3], // Thumb over F#, sus4
    "E2/F#": [2, 2, 2, 1, 0, 0], // F#m11-ish voicing often used for E2/F# in worship context, or correct E2 with F# bass
    // Better E2/F#: F# (2) + E (open) is clashing? 
    // Worship E2/F# is often 2x2100 (F#m7add11) acting as E/F#. 
    // Or strictly Eadd2/F# -> 2 2 4 1 0 0. Let's strive for the "worship open" sound.
    // 2 (F#) - 2 (B) - 2 (E) - 1 (G#) - 0 (B) - 0 (E). This is F#m11.
    // A true E2/F# implies F# bass, E, G#, B, F#.
    // Let's use:
    "A/C#": [-1, 4, 2, 2, 2, 0], // Re-ordering/ensuring it's there
    "F#m/C#": [-1, 4, 4, 2, 2, 2], // C# bass for F#m

    // 2s and add2s
    "C2": [-1, 3, 0, 0, 1, 0], // Cadd2
    "D2": [-1, -1, 0, 2, 3, 0], // Dsus2 / Dadd2 (no 3rd vs add 2? usually swappable in worship)
    "E2": [0, 2, 4, 1, 0, 0], // Eadd9/add2
    "F2": [1, 3, 3, 0, 1, 1], // Fadd2 (thumb) or [-1, 3, 3, 0, 1, 1]
    "G2": [3, 0, 0, 0, 0, 3], // G major with A? or 3x0203
    "A2": [-1, 0, 2, 2, 0, 0], // Asus2 often used as A2
    "B2": [-1, 2, 4, 4, 2, 2],

    // Missing Major 7ths & Sharps/Flats
    "F#": [2, 4, 4, 3, 2, 2],
    "F#7": [2, 4, 2, 3, 2, 2],
    "Ab": [4, 6, 6, 5, 4, 4],
    "Bb": [-1, 1, 3, 3, 3, 1],
    "Eb": [-1, 6, 5, 3, 4, 3], // or [-1, -1, 1, 3, 4, 3]

    // Missing Minor 7ths
    "F#m7": [2, 4, 2, 2, 2, 2],
    "C#m7": [-1, 4, 6, 4, 5, 4],
    "G#m": [4, 6, 6, 4, 4, 4],
    "G#m7": [4, 6, 4, 4, 4, 4],
    "Bbm7": [6, 8, 6, 6, 6, 6], // Barre 6th fret
    "Ebm": [-1, 6, 8, 8, 7, 6],
    "Ebm7": [-1, 6, 8, 6, 7, 6],

    // More 7ths
    "C#7": [-1, 4, 3, 4, 2, -1], // or Barre [-1, 4, 6, 4, 6, 4]
    "Eb7": [-1, 6, 5, 6, 4, -1],
    "Ab7": [4, 6, 4, 5, 4, 4],
    "Bb7": [-1, 1, 3, 1, 3, 1],

    // 9ths / Add9
    "A9": [-1, 0, 2, 0, 0, 0], // or [-1, 4, 5, 4, 5, -1] dominant 9
    "C9": [-1, 3, 2, 3, 3, -1],
    "D9": [-1, 5, 4, 5, 5, -1],
    "E9": [0, 2, 0, 1, 0, 2],
    "G9": [-1, -1, 5, 4, 6, 5], // Dominant 9 shape
    "F9": [-1, 8, 7, 8, 8, -1],
};

function getChordFingering(chordName) {
    if (CHORD_FINGERINGS[chordName]) return CHORD_FINGERINGS[chordName];

    // Handle flat/sharp aliases if not found
    // e.g. C# -> Db
    // Simple Aliases
    const aliases = {
        "C#": "Db", "Db": "C#",
        "D#": "Eb", "Eb": "D#",
        "F#": "Gb", "Gb": "F#",
        "G#": "Ab", "Ab": "G#",
        "A#": "Bb", "Bb": "A#",
    };

    if (aliases[chordName] && CHORD_FINGERINGS[aliases[chordName]]) {
        return CHORD_FINGERINGS[aliases[chordName]];
    }

    // Try detecting root only for fallback
    const match = chordName.match(/^([A-G](?:#|b)?)/);
    if (match) {
        const root = match[1];
        const isMinor = chordName.includes('m') && !chordName.includes('maj');
        const fallback = root + (isMinor ? 'm' : '');
        if (fallback !== chordName && CHORD_FINGERINGS[fallback]) {
            return CHORD_FINGERINGS[fallback];
        }
    }

    if (chordName.endsWith('M7')) {
        const root = chordName.replace('M7', '');
        const maj7Name = root + 'maj7';
        if (CHORD_FINGERINGS[maj7Name]) return CHORD_FINGERINGS[maj7Name];
    }

    return null;
}


function generateChordSVG(chordName, fingering) {
    // Config
    const width = 180; // Larger canvas
    const height = 180;
    const padding = 30; // Generous padding for text
    const frets = 5;
    const strings = 6;
    const fretSpacing = (height - padding * 2) / frets;
    const stringSpacing = (width - padding * 2) / (strings - 1);

    // Calculate base fret (offset) if higher up neck
    // For simplicity, we assume positions > 0 fit in first 5 frets unless min > 4
    let minFret = 999;
    let maxFret = -1;
    fingering.forEach(p => {
        if (p > 0) {
            if (p < minFret) minFret = p;
            if (p > maxFret) maxFret = p;
        }
    });

    let baseFret = 1;
    if (maxFret > 5) {
        baseFret = minFret;
    }

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

    // Draw Nut (if baseFret is 1)
    if (baseFret === 1) {
        svg += `<line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="var(--text-color)" stroke-width="4" />`;
    } else {
        // Draw Fret Number
        svg += `<text x="${padding - 10}" y="${padding + fretSpacing / 1.5}" fill="var(--text-muted)" text-anchor="end" font-family="Arial" font-size="14">${baseFret}fr</text>`;
    }

    // Draw Frets
    for (let i = 0; i <= frets; i++) {
        let y = padding + i * fretSpacing;
        // Skip first line if nut was drawn thick
        if (i === 0 && baseFret === 1) continue;
        svg += `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--text-muted)" stroke-opacity="0.5" stroke-width="1" />`;
    }

    // Draw Strings
    for (let i = 0; i < strings; i++) {
        let x = padding + i * stringSpacing;
        svg += `<line x1="${x}" y1="${padding}" x2="${x}" y2="${height - padding}" stroke="var(--text-muted)" stroke-opacity="0.8" stroke-width="${1 + (i * 0.2)}" />`; // Thicker low strings
    }

    // Draw Dots / Ms
    fingering.forEach((fret, stringIndex) => {
        let x = padding + stringIndex * stringSpacing;

        if (fret === -1) {
            // Mute (X)
            svg += `<text x="${x}" y="${padding - 5}" text-anchor="middle" fill="#ef4444" font-family="Arial" font-size="12">x</text>`;
        } else if (fret === 0) {
            // Open (O)
            svg += `<circle cx="${x}" cy="${padding - 8}" r="3" stroke="var(--text-muted)" stroke-width="1" fill="none" />`;
        } else {
            // Finger position
            // Adjust fret for baseFret
            let relativeFret = fret - baseFret + 1;
            if (relativeFret >= 1 && relativeFret <= frets) {
                let y = padding + (relativeFret - 0.5) * fretSpacing;
                svg += `<circle cx="${x}" cy="${y}" r="6" fill="var(--primary-color)" />`;
            }
        }
    });

    svg += `</svg>`;
    return svg;
}

// Tooltip Logic
function initChordTooltip() {
    // Create tooltip element if not exists
    let tooltip = document.getElementById('chord-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'chord-tooltip';
        document.body.appendChild(tooltip);
    }

    let isVisible = false;

    // Event Delegation for Chords
    document.body.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('chord')) {
            const chordName = e.target.getAttribute('data-chord');
            if (!chordName) return;

            const fingering = getChordFingering(chordName);

            // Content
            let html = `<h4>${chordName}</h4>`;
            if (fingering) {
                const svg = generateChordSVG(chordName, fingering);
                html += `<div class="chord-diagram">${svg}</div>`;
            } else {
                html += `<p style="color:#888; font-size: 0.8rem;">No diagram</p>`;
            }

            tooltip.innerHTML = html;
            tooltip.classList.add('visible');
            isVisible = true;

            updateTooltipPosition(e);
        }
    });

    document.body.addEventListener('mouseout', (e) => {
        if (e.target.classList.contains('chord')) {
            tooltip.classList.remove('visible');
            isVisible = false;
        }
    });

    document.body.addEventListener('mousemove', (e) => {
        if (isVisible) {
            updateTooltipPosition(e);
        }
    });

    function updateTooltipPosition(e) {
        // Position offset from cursor
        const offset = 15;
        let left = e.clientX + offset;
        let top = e.clientY + offset;

        // Boundary checks
        const rect = tooltip.getBoundingClientRect();
        if (left + rect.width > window.innerWidth) {
            left = e.clientX - rect.width - offset;
        }
        if (top + rect.height > window.innerHeight) {
            top = e.clientY - rect.height - offset;
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }
}

// Init on load
window.addEventListener('DOMContentLoaded', initChordTooltip);
// Also call now in case DOM is already ready (if script injected late)
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    initChordTooltip();
}

