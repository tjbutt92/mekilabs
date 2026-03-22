async function loadGames() {
  try {
    const response = await fetch('games.json');
    const games = await response.json();
    renderGames(games);
  } catch (error) {
    console.error('Failed to load games:', error);
    document.getElementById('games-grid').innerHTML = 
      '<p style="color: var(--text-secondary);">Unable to load games.</p>';
  }
}

function renderGames(games) {
  const grid = document.getElementById('games-grid');
  
  grid.innerHTML = games.map(game => {
    const webStatusClass = game.webStatus ? game.webStatus.toLowerCase().replace(' ', '-') : '';
    const androidStatusClass = game.androidStatus ? game.androidStatus.toLowerCase().replace(' ', '-') : '';
    const showAndroid = game.androidStatus && (game.androidStatus === 'Released' || game.androidStatus === 'In Development');
    
    return `
      <article class="game-card">
        <div class="game-banner">
          ${game.banner ? `<img src="${game.banner}" alt="${game.title}" loading="lazy">` : '<div class="banner-placeholder"></div>'}
        </div>
        <div class="game-card-content">
          <div class="game-header">
            <img src="${game.icon}" alt="" class="game-icon" onerror="this.style.display='none'">
            <h3>${game.title}</h3>
          </div>
          <p>${game.description}</p>
          <div class="game-tags">
            ${game.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
          </div>
          <div class="platform-status">
            ${game.webStatus ? `<span class="game-status web ${webStatusClass}">Web: ${game.webStatus}</span>` : ''}
            ${showAndroid ? `<span class="game-status android ${androidStatusClass}">Android: ${game.androidStatus}</span>` : ''}
          </div>
          <div class="platform-links">
            ${game.webUrl ? `<a href="${game.webUrl}" class="play-btn">Play Now</a>` : (game.webStatus ? '<span class="play-btn disabled">Coming Soon</span>' : '')}
            ${showAndroid && game.androidUrl ? `
              <div class="android-badge">
                <a href="${game.androidUrl}" target="_blank" rel="noopener"><img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" class="play-store-badge"></a>
              </div>
            ` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', loadGames);
