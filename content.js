// Copyright (c) 2025 MD NAHID HASAN
// Licensed under the MIT License. See LICENSE file for details.
// Content script for tracking prices on Daraz product pages
let currentProduct = null;

function extractProductInfo() {
    const name = document.querySelector('.pdp-mod-product-badge-title')?.textContent.trim();
    const price = extractPrice();
    const url = window.location.href;
    
    return { name, price, url };
}

function extractPrice() {
    const priceSelectors = [
        '.pdp-price',
        '.pdp-product-price',
        '[data-spm="price"] span',
        '[data-pdp-price]',
        '.price-box__content'
    ];
    
    for (const selector of priceSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.replace('৳', '').trim()) {
            const price = element.textContent
                .replace(/[^\d,.]/g, '')
                .replace(/,/g, '')
                .trim();
            if (price) return parseFloat(price);
        }
    }
    
    // Fallback
    const elements = document.querySelectorAll('*');
    for (const element of elements) {
        if (element.textContent.replace('৳', '').trim()) {
            const price = element.textContent
                .replace(/[^\d,.]/g, '')
                .replace(/,/g, '')
                .trim();
            if (price) return parseFloat(price);
        }
    }
    return null;
}

// Check if we're on a product page
if (window.location.href.includes('/products/')) {
    const product = extractProductInfo();
    if (product.price) {
        currentProduct = product;
        // Send price update to background script
        chrome.runtime.sendMessage({
            action: 'updatePrice',
            ...product
        });
        
        // Insert price history UI
        insertPriceHistoryUI();
    }
}

async function insertPriceHistoryUI() {
    const productData = await new Promise(resolve => {
        chrome.runtime.sendMessage(
            { action: 'getProductData', url: currentProduct.url },
            resolve
        );
    });
    
    const container = document.createElement('div');
    container.className = 'price-tracker-container';
    container.innerHTML = `
        <style>
            .price-tracker-container {
                margin: 20px 0;
                padding: 20px;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                background: white;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .price-tracker-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            .price-tracker-title {
                font-size: 18px;
                font-weight: 600;
                color: #424242;
            }
            .track-button {
                padding: 8px 16px;
                background: #f57224;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }
            .track-button:hover {
                background: #d65c15;
            }
            .price-stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                margin-bottom: 20px;
            }
            .stat-box {
                padding: 12px;
                background: #f8f8f8;
                border-radius: 6px;
                text-align: center;
            }
            .stat-label {
                font-size: 12px;
                color: #666;
                margin-bottom: 4px;
            }
            .stat-value {
                font-size: 16px;
                font-weight: 600;
                color: #424242;
            }
            .price-chart {
                width: 100%;
                height: 200px;
                margin: 20px 0;
                border: 1px solid #eee;
                border-radius: 4px;
            }
            .time-range {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
            }
            .time-button {
                padding: 6px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: white;
                cursor: pointer;
                font-size: 12px;
            }
            .time-button.active {
                background: #f57224;
                color: white;
                border-color: #f57224;
            }
            .alert-section {
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid #eee;
            }
            .alert-title {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 10px;
            }
            .alert-controls {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
            }
            .alert-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .alert-input {
                width: 100px;
                padding: 6px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            .alert-button {
                padding: 6px 12px;
                background: #f57224;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            .active-alerts {
                margin-top: 10px;
                font-size: 12px;
                color: #666;
            }
            .alert-badge {
                display: inline-block;
                padding: 2px 6px;
                background: #f0f0f0;
                border-radius: 3px;
                margin-right: 5px;
            }
            .price-trend {
                display: flex;
                align-items: center;
                gap: 5px;
                margin-top: 5px;
                font-size: 12px;
            }
            .trend-up {
                color: #d32f2f;
            }
            .trend-down {
                color: #2e7d32;
            }
        </style>
        <div class="price-tracker-header">
            <div class="price-tracker-title">Price History</div>
            <button class="track-button">
                ${productData?.isTracking ? 'Stop Tracking' : 'Track Price'}
            </button>
        </div>
        ${productData ? `
            <div class="price-stats">
                <div class="stat-box">
                    <div class="stat-label">Current Price</div>
                    <div class="stat-value">${productData.currentPrice.toLocaleString()}</div>
                    ${calculatePriceChange(productData.priceHistory) !== 0 ? `
                        <div class="price-trend ${calculatePriceChange(productData.priceHistory) > 0 ? 'trend-up' : 'trend-down'}">
                            ${calculatePriceChange(productData.priceHistory) > 0 ? '↑' : '↓'}
                            ${Math.abs(calculatePriceChange(productData.priceHistory)).toFixed(1)}%
                        </div>
                    ` : ''}
                </div>
                <div class="stat-box">
                    <div class="stat-label">Lowest Price</div>
                    <div class="stat-value">${productData.lowestPrice.toLocaleString()}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Highest Price</div>
                    <div class="stat-value">${productData.highestPrice.toLocaleString()}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Tracking Duration</div>
                    <div class="stat-value">${getTrackingDuration(productData.priceHistory)}</div>
                </div>
            </div>
            <div class="time-range">
                <button class="time-button" data-days="7">7d</button>
                <button class="time-button" data-days="30">30d</button>
                <button class="time-button active" data-days="90">90d</button>
            </div>
            <canvas id="priceChart" class="price-chart"></canvas>
            <div class="alert-section">
                <div class="alert-title">Price Alerts</div>
                <div class="alert-controls">
                    <div class="alert-row">
                        <input type="number" class="alert-input below-price" placeholder="Below " 
                            value="${productData.priceAlerts?.below || ''}">
                        <button class="alert-button set-below-alert">Set Alert</button>
                    </div>
                    <div class="alert-row">
                        <input type="number" class="alert-input above-price" placeholder="Above "
                            value="${productData.priceAlerts?.above || ''}">
                        <button class="alert-button set-above-alert">Set Alert</button>
                    </div>
                </div>
                <div class="active-alerts"></div>
            </div>
        ` : ''}
    `;
    
    // Insert the container
    const priceElement = document.querySelector('.pdp-price');
    if (priceElement) {
        priceElement.parentNode.insertBefore(container, priceElement.nextSibling);
        
        if (productData) {
            // Initialize chart
            drawPriceChart(productData.priceHistory);
            
            // Add event listeners
            setupEventListeners(container, productData);
            
            // Update alert badges
            if (productData.priceAlerts) {
                updateAlertBadges(container, productData.priceAlerts);
            }
        }
    }
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

function drawPriceChart(priceHistory) {
    const canvas = document.getElementById('priceChart');
    if (!canvas || !priceHistory || priceHistory.length < 2) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 20;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    const prices = priceHistory.map(p => p.price);
    const dates = priceHistory.map(p => new Date(p.timestamp));
    
    const minPrice = Math.min(...prices) * 0.95;
    const maxPrice = Math.max(...prices) * 1.05;
    const priceRange = maxPrice - minPrice;
    
    const timeRange = dates[dates.length - 1] - dates[0];
    
    // Draw axes
    ctx.beginPath();
    ctx.strokeStyle = '#ddd';
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
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
        
        // Draw point
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#f57224';
        ctx.fill();
    });
    
    ctx.stroke();
    
    // Add price labels
    ctx.font = '10px Arial';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(maxPrice).toLocaleString()}`, padding - 5, padding + 5);
    ctx.fillText(`${Math.round(minPrice).toLocaleString()}`, padding - 5, height - padding + 15);
    
    // Add date labels
    ctx.textAlign = 'center';
    ctx.fillText(formatDate(dates[0]), padding, height - 5);
    ctx.fillText(formatDate(dates[dates.length - 1]), width - padding, height - 5);
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function setupEventListeners(container, productData) {
    // Track button
    const trackButton = container.querySelector('.track-button');
    trackButton.addEventListener('click', async () => {
        const response = await new Promise(resolve => {
            chrome.runtime.sendMessage({
                action: 'toggleTracking',
                ...currentProduct
            }, resolve);
        });
        
        trackButton.textContent = response.isTracking ? 'Stop Tracking' : 'Track Price';
    });
    
    // Time range buttons
    const timeButtons = container.querySelectorAll('.time-button');
    timeButtons.forEach(button => {
        button.addEventListener('click', () => {
            timeButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            const days = parseInt(button.dataset.days);
            const filteredHistory = filterPriceHistory(productData.priceHistory, days);
            drawPriceChart(filteredHistory);
        });
    });
    
    // Alert buttons
    const belowAlertBtn = container.querySelector('.set-below-alert');
    const aboveAlertBtn = container.querySelector('.set-above-alert');
    
    belowAlertBtn.addEventListener('click', async () => {
        const input = container.querySelector('.below-price');
        const price = parseFloat(input.value);
        if (!isNaN(price) && price > 0) {
            const response = await new Promise(resolve => {
                chrome.runtime.sendMessage({
                    action: 'setPriceAlert',
                    url: currentProduct.url,
                    alertType: 'below',
                    price
                }, resolve);
            });
            if (response.success) {
                updateAlertBadges(container, response.alerts);
            }
        }
    });
    
    aboveAlertBtn.addEventListener('click', async () => {
        const input = container.querySelector('.above-price');
        const price = parseFloat(input.value);
        if (!isNaN(price) && price > 0) {
            const response = await new Promise(resolve => {
                chrome.runtime.sendMessage({
                    action: 'setPriceAlert',
                    url: currentProduct.url,
                    alertType: 'above',
                    price
                }, resolve);
            });
            if (response.success) {
                updateAlertBadges(container, response.alerts);
            }
        }
    });
}

function filterPriceHistory(history, days) {
    if (!history || history.length === 0) return [];
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return history.filter(p => p.timestamp >= cutoff);
}

function updateAlertBadges(container, alerts) {
    const alertsDiv = container.querySelector('.active-alerts');
    const badges = [];
    
    if (alerts.below) {
        badges.push(`<span class="alert-badge">Below ${alerts.below.toLocaleString()}</span>`);
    }
    if (alerts.above) {
        badges.push(`<span class="alert-badge">Above ${alerts.above.toLocaleString()}</span>`);
    }
    
    alertsDiv.innerHTML = badges.length ? `Active alerts: ${badges.join('')}` : '';
}

// Listen for price update requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPrice') {
        const price = extractPrice();
        sendResponse({ price });
    }
    return true;
});