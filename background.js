// Copyright (c) 2025 MD NAHID HASAN
// Licensed under the MIT License. See LICENSE file for details.
// background.js
// This is a service worker that runs in the background

chrome.runtime.onInstalled.addListener(() => {
  // Set up alarm for price checking every 6 hours
  chrome.alarms.create('checkPrices', { periodInMinutes: 360 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkPrices') {
    checkTrackedProducts();
  }
});

async function checkTrackedProducts() {
  const { trackedProducts = {} } = await chrome.storage.local.get('trackedProducts');
  
  for (const [url, product] of Object.entries(trackedProducts)) {
    try {
      const tab = await chrome.tabs.create({ url, active: false });
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for page load
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: scrapeProductPrice
      });
      
      chrome.tabs.remove(tab.id);
    } catch (error) {
      console.error('Error checking product:', url, error);
    }
  }
}

// Add this function after the checkTrackedProducts function

function scrapeProductPrice() {
  const price = document.querySelector('.pdp-price')?.textContent.trim();
  if (price && price.replace('৳', '').trim()) {
      return parseFloat(price.replace(/[^\d,.]/g, '').replace(/,/g, ''));
  }
  
  // Fallback to other selectors if main price selector fails
  const priceSelectors = [
      '[data-spm="price"] span',
      '.pdp-product-price',
      '[data-pdp-price]',
      '.price-box__content'
  ];

  for (const selector of priceSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.replace('৳', '').trim()) {
          return parseFloat(element.textContent
              .replace(/[^\d,.]/g, '')
              .replace(/,/g, '')
              .trim());
      }
  }

  // Final fallback - search all elements for price
  const elements = document.querySelectorAll('*');
  for (const element of elements) {
      if (element.textContent.replace('৳', '').trim()) {
          return parseFloat(element.textContent
              .replace(/[^\d,.]/g, '')
              .replace(/,/g, '')
              .trim());
      }
  }
  
  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updatePrice') {
    updateProductPrice(request.url, request.price, request.name);
    return true;
  }
  
  if (request.action === 'getProductData') {
    getProductData(request.url).then(sendResponse);
    return true;
  }
  
  if (request.action === 'toggleTracking') {
    toggleProductTracking(request.url, request.name, request.price).then(sendResponse);
    return true;
  }

  if (request.action === 'searchProducts') {
    const searchUrl = request.searchUrl;
    
    // Create a tab to load the search results
    chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
      // Give the page time to load
      setTimeout(() => {
        // Execute script to scrape products
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: scrapeProducts
        })
        .then((results) => {
          // Close the tab
          chrome.tabs.remove(tab.id);
          
          if (results && results[0] && results[0].result) {
            const scrapedData = results[0].result;
            // Send the products back to the popup
            sendResponse({ 
              products: scrapedData.products,
              debugInfo: scrapedData.debugInfo 
            });
          } else {
            sendResponse({ 
              error: 'No results found',
              debugInfo: 'Script execution returned no data' 
            });
          }
        })
        .catch((error) => {
          // Close the tab even if there's an error
          chrome.tabs.remove(tab.id);
          sendResponse({ 
            error: error.message,
            debugInfo: 'Script execution error: ' + error.message 
          });
        });
      }, 8000); // Wait 8 seconds for the page to load completely
    });
    
    return true; // Keep the message channel open for async response
  }

  if (request.action === 'setPriceAlert') {
    setPriceAlert(request.url, request.alertType, request.price).then(sendResponse);
    return true;
  }
});

async function updateProductPrice(url, price, name) {
  const timestamp = Date.now();
  const { trackedProducts = {} } = await chrome.storage.local.get('trackedProducts');
  
  if (trackedProducts[url]) {
    const product = trackedProducts[url];
    product.priceHistory.push({ price, timestamp });
    product.currentPrice = price;
    product.lastChecked = timestamp;
    
    // Keep only last 90 days of price history
    const ninetyDaysAgo = timestamp - (90 * 24 * 60 * 60 * 1000);
    product.priceHistory = product.priceHistory.filter(p => p.timestamp >= ninetyDaysAgo);
    
    // Update statistics
    product.lowestPrice = Math.min(...product.priceHistory.map(p => p.price));
    product.highestPrice = Math.max(...product.priceHistory.map(p => p.price));
    
    // Check price alerts
    if (product.priceAlerts) {
      checkPriceAlerts(product, url);
    }
    
    await chrome.storage.local.set({ trackedProducts });
  }
}

async function checkPriceAlerts(product, url) {
  if (product.priceAlerts.below && product.currentPrice <= product.priceAlerts.below) {
    // Create notification for price drop
    chrome.notifications.create(`price-alert-${url}`, {
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: 'Price Drop Alert!',
      message: `${product.name} price has dropped to ${product.currentPrice}! (Below your target of ${product.priceAlerts.below})`,
      buttons: [{ title: 'View Product' }]
    });
  }
  
  if (product.priceAlerts.above && product.currentPrice >= product.priceAlerts.above) {
    // Create notification for price increase
    chrome.notifications.create(`price-alert-${url}`, {
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: 'Price Increase Alert!',
      message: `${product.name} price has increased to ${product.currentPrice}! (Above your target of ${product.priceAlerts.above})`,
      buttons: [{ title: 'View Product' }]
    });
  }
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId.startsWith('price-alert-')) {
    const url = notificationId.replace('price-alert-', '');
    chrome.tabs.create({ url });
  }
});

async function setPriceAlert(url, alertType, price) {
  const { trackedProducts = {} } = await chrome.storage.local.get('trackedProducts');
  
  if (trackedProducts[url]) {
    const product = trackedProducts[url];
    if (!product.priceAlerts) {
      product.priceAlerts = {};
    }
    
    if (price) {
      product.priceAlerts[alertType] = price;
    } else {
      delete product.priceAlerts[alertType];
    }
    
    await chrome.storage.local.set({ trackedProducts });
    return { success: true, alerts: product.priceAlerts };
  }
  
  return { success: false };
}

async function toggleProductTracking(url, name, price) {
  const { trackedProducts = {} } = await chrome.storage.local.get('trackedProducts');
  
  if (trackedProducts[url]) {
    delete trackedProducts[url];
  } else {
    trackedProducts[url] = {
      name,
      currentPrice: price,
      priceHistory: [{ price, timestamp: Date.now() }],
      lowestPrice: price,
      highestPrice: price,
      lastChecked: Date.now(),
      isTracking: true
    };
  }
  
  await chrome.storage.local.set({ trackedProducts });
  return { isTracking: !!trackedProducts[url] };
}

async function getProductData(url) {
  const { trackedProducts = {} } = await chrome.storage.local.get('trackedProducts');
  return trackedProducts[url] || null;
}

// Function to scrape products from Daraz page
function scrapeProducts() {
  try {
    const products = [];
    let debugInfo = '';
    
    // Let's try to identify the HTML structure
    const htmlStructure = {
      hasGridItems: document.querySelectorAll('.gridItem').length,
      hasC1t2i: document.querySelectorAll('.c1_t2i').length,
      hasC2prKI: document.querySelectorAll('.c2prKI').length,
      hasCards: document.querySelectorAll('[data-qa-locator="product-item"]').length,
      hasListItems: document.querySelectorAll('.list-item').length,
      hasBoxItems: document.querySelectorAll('.box--ujueT').length,
      hasPriceSections: document.querySelectorAll('[data-spm="price"]').length,
      totalProductSelectors: document.querySelectorAll('.product-card, .product-item, [data-tracking="product-card"]').length
    };
    
    debugInfo = JSON.stringify(htmlStructure);
    
    // Try various selector combinations for Daraz's changing layout
    
    // Method 1: Modern Daraz layout (2023-2025)
    const modernCards = document.querySelectorAll('[data-qa-locator="product-item"], .box--ujueT, [data-tracking="product-card"]');
    if (modernCards && modernCards.length > 0) {
      debugInfo += ' | Found modern cards: ' + modernCards.length;
      
      modernCards.forEach(card => {
        try {
          // Try to find name - multiple possible selectors
          let name = '';
          const nameElement = card.querySelector('[data-qa-locator="product-name"], .title--wFj93, .name__Ut7Yj');
          if (nameElement) {
            name = nameElement.textContent.trim();
          } else {
            // Try alternative method
            const linkWithTitle = card.querySelector('a[title]');
            if (linkWithTitle) {
              name = linkWithTitle.getAttribute('title');
            }
          }
          
          // Enhanced price scraping logic
          let price = null;
          // Try multiple price selectors
          const priceSelectors = [
            '.price--NVB62 span',
            '[data-spm="price"] span',
            '.currency--GVKjl',
            '.pdp-price',
            '.price'
          ];
          
          for (const selector of priceSelectors) {
            const priceElement = card.querySelector(selector);
            if (priceElement && priceElement.textContent.replace('৳', '').trim()) {
              price = priceElement.textContent
                .replace(/[^\d,.]/g, '') // Remove everything except digits, dots and commas
                .replace(/,/g, '')  // Remove commas
                .trim();
              if (price) break;
            }
          }
      
          // If still no price found, try the broader approach
          if (!price) {
            const allSpans = card.querySelectorAll('span');
            for (const span of allSpans) {
              if (span.textContent.replace('৳', '').trim()) {
                price = span.textContent
                  .replace(/[^\d,.]/g, '')
                  .replace(/,/g, '')
                  .trim();
                break;
              }
            }
          }
      
          // Find URL
          let url = '';
          const linkElement = card.querySelector('a[href]');
          if (linkElement) {
            url = linkElement.href;
          }
          
          if (name && price && !isNaN(parseFloat(price)) && parseFloat(price) > 0 && url) {
            products.push({ 
              name, 
              price: parseFloat(price), 
              url 
            });
          }
        } catch (error) {
          debugInfo += ' | Error parsing modern card: ' + error.message;
        }
      });
    }
    
    // Method 2: Try classic selectors if modern approach didn't work
    if (products.length === 0) {
      const classicCards = document.querySelectorAll('.gridItem, .c1_t2i, .c2prKI, .c2prp4, .Product--nH1LGn');
      
      debugInfo += ' | Trying classic cards: ' + classicCards.length;
      
      classicCards.forEach(card => {
        try {
          // For name
          let name = '';
          const nameElement = card.querySelector('.title, .c16H9d, .c3KeDq, .title--wFj93');
          if (nameElement) {
            name = nameElement.textContent.trim();
          }
          
          // For price
          let price = Array.from(document.querySelectorAll('span')).find(el => el.innerText)?.innerText


          
          // For URL
          let url = '';
          const linkElement = card.querySelector('a');
          if (linkElement) {
            url = linkElement.href;
          }
          
          if (name && !isNaN(price) && price > 0 && url) {
            products.push({ name, price, url });
          }
        } catch (error) {
          debugInfo += ' | Error parsing classic card: ' + error.message;
        }
      });
    }
    
    // Method 3: Generic approach if previous methods failed
    if (products.length === 0) {
      debugInfo += ' | Trying generic approach';
      
      // Find all link elements that likely point to products
      const allLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'));
      
      allLinks.forEach(link => {
        try {
          const container = link.closest('div');
          if (!container) return;
          
          // Try to get name from link title or text content
          let name = link.getAttribute('title') || link.textContent.trim();
          
          // Look for price near this element
          let price = Array.from(document.querySelectorAll('span')).find(el => el.innerText)?.innerText


          
          const url = link.href;
          
          if (name && !isNaN(price) && price > 0 && url) {
            products.push({ name, price, url });
          }
        } catch (error) {
          debugInfo += ' | Error in generic approach: ' + error.message;
        }
      });
    }
    
    // Method 4: Look for elements with Taka symbol directly
    if (products.length === 0) {
      debugInfo += ' | Trying Taka symbol approach';
      
      // Find all elements containing the Taka symbol
      const takaElements = [];
      const allElements = document.querySelectorAll('*');
      for (let i = 0; i < allElements.length; i++) {
        if (allElements[i].textContent.replace('৳', '').trim()) {
          takaElements.push(allElements[i]);
        }
      }
      
      debugInfo += ' | Found ' + takaElements.length + ' elements with Taka symbol';
      
      takaElements.forEach(priceElement => {
        try {
         
          const price = Array.from(document.querySelectorAll('span')).find(el => el.innerText)?.innerText;
          
          // Find name and URL by looking at parent elements
          let container = priceElement;
          for (let i = 0; i < 5; i++) { // Go up to 5 levels up
            container = container.parentElement;
            if (!container) break;
            
            const linkElement = container.querySelector('a[href*="/products/"]');
            if (linkElement) {
              const name = linkElement.getAttribute('title') || linkElement.textContent.trim();
              const url = linkElement.href;
              
              if (name && !isNaN(price) && price > 0 && url) {
                products.push({ name, price, url });
                break; // Found what we need, stop looking up
              }
            }
          }
        } catch (error) {
          debugInfo += ' | Error in Taka symbol approach: ' + error.message;
        }
      });
    }
    
    // Helper function to find price text near an element
    function findPriceNearElement(element) {
      // Look for elements with currency symbols or numbers
      const possiblePriceElements = element.querySelectorAll('*');
      for (let i = 0; i < possiblePriceElements.length; i++) {
        const text = possiblePriceElements[i].textContent.trim();
        // Look for price patterns: numbers with commas/decimals
        if (/\d+,?\d+(\.\d+)?/.test(text)) {
          return text.replace(/[^\d.]/g, '').replace(/\.(?=.*\.)/g, '');
        }
      }
      return null;
    }
    
    // Sort products by price from low to high
    products.sort((a, b) => a.price - b.price);
    
    // Remove duplicates based on URL
    const uniqueProducts = [];
    const seenUrls = new Set();
    
    products.forEach(product => {
      if (!seenUrls.has(product.url)) {
        seenUrls.add(product.url);
        uniqueProducts.push(product);
      }
    });
    
    return {
      products: uniqueProducts,
      debugInfo: debugInfo + ` | Final unique products: ${uniqueProducts.length}`
    };
  } catch (error) {
    return {
      products: [],
      debugInfo: 'Top-level scraping error: ' + error.message
    };
  }
}