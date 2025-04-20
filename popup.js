// Copyright (c) 2025 MD NAHID HASAN
// Licensed under the MIT License. See LICENSE file for details.
// popup.js
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const resultsDiv = document.getElementById('results');
    const trackedProductsDiv = document.getElementById('trackedProducts');
    
    // Tab handling
    const tabs = document.querySelectorAll('.tab');
    const sections = {
        search: document.getElementById('searchSection'),
        tracked: document.getElementById('trackedSection')
    };
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show/hide sections
            Object.entries(sections).forEach(([name, section]) => {
                section.style.display = name === tabName ? 'block' : 'none';
            });
            
            // Load tracked products if needed
            if (tabName === 'tracked') {
                loadTrackedProducts();
            }
        });
    });
    
    // Focus on input and handle Enter key
    searchInput.focus();
    searchInput.addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            performSearch();
        }
    });
    
    searchButton.addEventListener('click', performSearch);
    
    function performSearch() {
        const query = searchInput.value.trim();
        
        if (!query) {
            resultsDiv.innerHTML = '<p>Please enter a product name.</p>';
            return;
        }
        
        resultsDiv.innerHTML = '<div class="loading">Searching Daraz Bangladesh...</div>';
        
        const searchUrl = `https://www.daraz.com.bd/catalog/?q=${encodeURIComponent(query)}&sort=price_asc`;
        
        chrome.runtime.sendMessage({
            action: 'searchProducts',
            searchUrl: searchUrl,
            productName: query
        }, displaySearchResults);
    }
    
    function displaySearchResults(response) {
        if (!response || !response.products || response.products.length === 0) {
            resultsDiv.innerHTML = `
                <div class="product-card">
                    <p>No products found.</p>
                    <button onclick="window.open('${searchUrl}', '_blank')">View on Daraz</button>
                </div>
            `;
            return;
        }
        
        const products = response.products.slice(0, 10);
        let html = '';
        
        products.forEach(product => {
            html += `
                <div class="product-card">
                    <div class="product-title">${product.name}</div>
                    <div class="price-info">
                        <span>${product.price.toLocaleString()}</span>
                        <button class="track-button" data-url="${product.url}" data-name="${encodeURIComponent(product.name)}" data-price="${product.price}">
                            Track Price
                        </button>
                    </div>
                </div>
            `;
        });
        
        resultsDiv.innerHTML = html;
        
        // Add event listeners to track buttons
        resultsDiv.querySelectorAll('.track-button').forEach(button => {
            button.addEventListener('click', async () => {
                const url = button.dataset.url;
                const name = decodeURIComponent(button.dataset.name);
                const price = parseFloat(button.dataset.price);
                
                const response = await new Promise(resolve => {
                    chrome.runtime.sendMessage({
                        action: 'toggleTracking',
                        url,
                        name,
                        price
                    }, resolve);
                });
                
                button.textContent = response.isTracking ? 'Stop Tracking' : 'Track Price';
            });
        });
    }
    
    async function loadTrackedProducts() {
        const { trackedProducts = {} } = await chrome.storage.local.get('trackedProducts');
        
        if (Object.keys(trackedProducts).length === 0) {
            trackedProductsDiv.innerHTML = `
                <div class="product-card">
                    <p>No products being tracked.</p>
                    <p>Visit a product page or search for products to start tracking prices.</p>
                </div>
            `;
            return;
        }
        
        // Clear existing content
        trackedProductsDiv.innerHTML = '';
        const template = document.getElementById('productCardTemplate');
        
        for (const [url, product] of Object.entries(trackedProducts)) {
            const card = template.content.cloneNode(true).firstElementChild;
            
            // Set product details
            const titleLink = card.querySelector('.product-title a');
            titleLink.href = url;
            titleLink.textContent = product.name;
            
            // Set price trend
            const priceChange = calculatePriceChange(product.priceHistory);
            if (priceChange !== 0) {
                const trendSpan = card.querySelector('.price-trend');
                trendSpan.textContent = `${priceChange > 0 ? '↑' : '↓'} ${Math.abs(priceChange).toFixed(1)}%`;
                trendSpan.classList.add(priceChange > 0 ? 'price-up' : 'price-down');
            }
            
            // Set current price
            card.querySelector('.current-price').textContent = `${product.currentPrice.toLocaleString()}`;
            
            // Set stats
            card.querySelector('.lowest-price').textContent = `${product.lowestPrice.toLocaleString()}`;
            card.querySelector('.highest-price').textContent = `${product.highestPrice.toLocaleString()}`;
            card.querySelector('.tracking-duration').textContent = getTrackingDuration(product.priceHistory);
            
            // Set existing alerts if any
            if (product.priceAlerts) {
                if (product.priceAlerts.below) {
                    card.querySelector('.below-price').value = product.priceAlerts.below;
                }
                if (product.priceAlerts.above) {
                    card.querySelector('.above-price').value = product.priceAlerts.above;
                }
                updateAlertBadges(card, product.priceAlerts);
            }
            
            // Set last updated
            const lastChecked = new Date(product.lastChecked);
            card.querySelector('.last-updated').textContent = `Last updated: ${formatTimeAgo(lastChecked)}`;
            
            // Add event listeners for alert controls
            const belowAlertBtn = card.querySelector('.set-below-alert');
            const aboveAlertBtn = card.querySelector('.set-above-alert');
            
            belowAlertBtn.addEventListener('click', async () => {
                const input = card.querySelector('.below-price');
                const price = parseFloat(input.value);
                if (!isNaN(price) && price > 0) {
                    const response = await new Promise(resolve => {
                        chrome.runtime.sendMessage({
                            action: 'setPriceAlert',
                            url,
                            alertType: 'below',
                            price
                        }, resolve);
                    });
                    if (response.success) {
                        updateAlertBadges(card, response.alerts);
                    }
                }
            });
            
            aboveAlertBtn.addEventListener('click', async () => {
                const input = card.querySelector('.above-price');
                const price = parseFloat(input.value);
                if (!isNaN(price) && price > 0) {
                    const response = await new Promise(resolve => {
                        chrome.runtime.sendMessage({
                            action: 'setPriceAlert',
                            url,
                            alertType: 'above',
                            price
                        }, resolve);
                    });
                    if (response.success) {
                        updateAlertBadges(card, response.alerts);
                    }
                }
            });
            
            // Add time range controls
            const timeButtons = card.querySelectorAll('.time-button');
            timeButtons.forEach(button => {
                button.addEventListener('click', () => {
                    timeButtons.forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    const days = parseInt(button.dataset.days);
                    drawPriceChart(card.querySelector('canvas'), filterPriceHistory(product.priceHistory, days));
                });
            });
            
            // Draw initial chart with 90 days of data
            drawPriceChart(card.querySelector('canvas'), filterPriceHistory(product.priceHistory, 90));
            
            trackedProductsDiv.appendChild(card);
        }
    }
    
    function updateAlertBadges(card, alerts) {
        const alertsDiv = card.querySelector('.active-alerts');
        const badges = [];
        
        if (alerts.below) {
            badges.push(`<span class="alert-badge">Below ${alerts.below}</span>`);
        }
        if (alerts.above) {
            badges.push(`<span class="alert-badge">Above ${alerts.above}</span>`);
        }
        
        alertsDiv.innerHTML = badges.length ? `Active alerts: ${badges.join('')}` : '';
    }
    
    function filterPriceHistory(history, days) {
        if (!history || history.length === 0) return [];
        
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        return history.filter(p => p.timestamp >= cutoff);
    }
    
    function formatTimeAgo(date) {
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'just now';
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }
    
    function calculatePriceChange(priceHistory) {
        if (!priceHistory || priceHistory.length < 2) return 0;
        
        const oldestPrice = priceHistory[0].price;
        const currentPrice = priceHistory[priceHistory.length - 1].price;
        
        return ((currentPrice - oldestPrice) / oldestPrice) * 100;
    }
    
    function getTrackingDuration(priceHistory) {
        if (!priceHistory || priceHistory.length === 0) return 'Just started';
        
        const firstDate = new Date(priceHistory[0].timestamp);
        const now = new Date();
        const days = Math.floor((now - firstDate) / (1000 * 60 * 60 * 24));
        
        if (days === 0) return 'Today';
        if (days === 1) return '1 day';
        return `${days} days`;
    }
    
    function drawPriceChart(canvas, priceHistory) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = 10;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        if (!priceHistory || priceHistory.length < 2) {
            ctx.textAlign = 'center';
            ctx.fillText('Not enough data', width/2, height/2);
            return;
        }
        
        const prices = priceHistory.map(p => p.price);
        const dates = priceHistory.map(p => new Date(p.timestamp));
        
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;
        
        const timeRange = dates[dates.length - 1] - dates[0];
        
        // Draw price line
        ctx.beginPath();
        ctx.strokeStyle = '#f57224';
        ctx.lineWidth = 2;
        
        priceHistory.forEach((point, i) => {
            const x = padding + ((point.timestamp - dates[0]) / timeRange) * (width - 2 * padding);
            const y = height - padding - ((point.price - minPrice) / priceRange) * (height - 2 * padding);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Add price labels
        ctx.font = '10px Arial';
        ctx.fillStyle = '#666';
        ctx.textAlign = 'left';
        ctx.fillText(`${minPrice.toLocaleString()}`, 2, height - 2);
        ctx.textAlign = 'right';
        ctx.fillText(`${maxPrice.toLocaleString()}`, width - 2, 10);
    }
    
    // Load tracked products on popup open
    loadTrackedProducts();
});
