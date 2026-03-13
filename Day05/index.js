import { GoogleGenAI } from "@google/genai";
import { configDotenv } from "dotenv";
import readlineSync from "readline-sync";

configDotenv();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Cryptocurrency function - returns simple one-line answer
async function getCryptoPrice(coin) {
   try {
      const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&ids=${coin}`);
      const data = await response.json();
      
      if (data && data.length > 0) {
         const coinData = data[0];
         const price = coinData.current_price.toLocaleString('en-IN');
         const change = coinData.price_change_percentage_24h?.toFixed(2);
         return `${coinData.name} price is ₹${price} INR (${change > 0 ? '+' : ''}${change}%)`;
      }
      return `Unable to fetch ${coin} price`;
   } catch (error) {
      return `Error fetching ${coin} price`;
   }
}

// Smart city extraction using AI
async function extractCityFromQuery(query) {
   try {
      const result = await genAI.models.generateContent({
         model: "gemini-2.5-flash",
         contents: [{ 
            role: "user", 
            parts: [{ 
               text: `Extract only the city name from this weather query. Return just the city name, nothing else. If no city is mentioned, return "unknown". Query: "${query}"` 
            }] 
         }]
      });
      
      if (result.candidates && result.candidates[0] && result.candidates[0].content) {
         const textPart = result.candidates[0].content.parts.find(part => part.text);
         if (textPart) {
            return textPart.text.trim();
         }
      }
      return "unknown";
   } catch (error) {
      return "unknown";
   }
}
async function getWeather(city) {
   try {
      const response = await fetch(`https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${city}&aqi=no`);
      
      if (!response.ok) {
         return `Unable to fetch weather for ${city}`;
      }
      
      const data = await response.json();
      return `Weather in ${data.location.name}: ${data.current.temp_c}°C, ${data.current.condition.text}`;
   } catch (error) {
      return `Error fetching weather for ${city}`;
   }
}

// Simple command processor that gives one-line answers
async function processQuery(input) {
   const lower = input.toLowerCase();
   
   // Cryptocurrency queries - use real-time API
   if (lower.includes('bitcoin') || lower.includes('btc')) {
      return await getCryptoPrice('bitcoin');
   }
   
   if (lower.includes('ethereum') || lower.includes('eth')) {
      return await getCryptoPrice('ethereum');
   }
   
   if (lower.includes('dogecoin') || lower.includes('doge')) {
      return await getCryptoPrice('dogecoin');
   }
   
   if (lower.includes('cardano') || lower.includes('ada')) {
      return await getCryptoPrice('cardano');
   }
   
   if (lower.includes('solana') || lower.includes('sol')) {
      return await getCryptoPrice('solana');
   }
   
   if (lower.includes('polkadot') || lower.includes('dot')) {
      return await getCryptoPrice('polkadot');
   }
   
   if (lower.includes('chainlink') || lower.includes('link')) {
      return await getCryptoPrice('chainlink');
   }
   
   if (lower.includes('litecoin') || lower.includes('ltc')) {
      return await getCryptoPrice('litecoin');
   }
   
   // Weather queries - use AI to extract city name smartly
   if (lower.includes('weather') || lower.includes('temperature') || lower.includes('temp')) {
      const cityName = await extractCityFromQuery(input);
      if (cityName && cityName !== "unknown") {
         return await getWeather(cityName);
      } else {
         return "Please specify a city for weather information (e.g., 'weather in London')";
      }
   }
   
   // For all other questions - use Google AI
   try {
      const result = await genAI.models.generateContent({
         model: "gemini-2.5-flash",
         contents: [{ role: "user", parts: [{ text: input }] }]
      });
      
      if (result.candidates && result.candidates[0] && result.candidates[0].content) {
         const textPart = result.candidates[0].content.parts.find(part => part.text);
         if (textPart) {
            return textPart.text;
         }
      }
      return "Sorry, I couldn't process that question. Please try again.";
   } catch (error) {
      return "Sorry, I couldn't process that question. Please try again.";
   }
}

// Main application
console.log("🚀 AI Assistant with Real-time Data");
console.log("💡 I can answer any question + provide live crypto/weather data!");
console.log("📝 Examples:");
console.log("   • 'Bitcoin price' → Bitcoin price is ₹64,77,823 INR");
console.log("   • 'Weather in London' → Weather in London: 13°C, Partly cloudy");
console.log("   • 'What is the capital of France?' → Paris is the capital of France");
console.log("   • 'Tell me a joke' → Why did the programmer quit his job?...");

// Check if command line arguments are provided
const args = process.argv.slice(2);
if (args.length > 0) {
   // Command line mode
   const query = args.join(' ');
   console.log(`\n💬 Query: ${query}`);
   
   const lower = query.toLowerCase();
   const isRealTimeQuery = (lower.includes('bitcoin') || lower.includes('btc') || 
                           lower.includes('ethereum') || lower.includes('eth') ||
                           lower.includes('dogecoin') || lower.includes('doge') ||
                           lower.includes('cardano') || lower.includes('ada') ||
                           lower.includes('solana') || lower.includes('sol') ||
                           lower.includes('polkadot') || lower.includes('dot') ||
                           lower.includes('chainlink') || lower.includes('link') ||
                           lower.includes('litecoin') || lower.includes('ltc') ||
                           lower.includes('weather') || lower.includes('temperature') || lower.includes('temp'));
   
   if (isRealTimeQuery) {
      console.log('� Fetching live data...');
   }
   
   try {
      const answer = await processQuery(query);
      console.log('�', answer);
   } catch (error) {
      console.log('❌ Error:', error.message);
   }
} else {
   // Interactive mode
   console.log("\n� Interactive mode (type 'exit' to quit):");
   console.log("💡 Tip: If readline doesn't work, use: node index.js <your question>");
   
   while (true) {
      try {
         const question = readlineSync.question('\n� Ask me: ');
         
         if (question.toLowerCase() === 'exit' || question.toLowerCase() === 'quit') {
            console.log('👋 Goodbye!');
            break;
         }
         
         if (question.trim() === '') {
            continue;
         }
         
         const lower = question.toLowerCase();
         const isRealTimeQuery = (lower.includes('bitcoin') || lower.includes('btc') || 
                                 lower.includes('ethereum') || lower.includes('eth') ||
                                 lower.includes('dogecoin') || lower.includes('doge') ||
                                 lower.includes('cardano') || lower.includes('ada') ||
                                 lower.includes('solana') || lower.includes('sol') ||
                                 lower.includes('polkadot') || lower.includes('dot') ||
                                 lower.includes('chainlink') || lower.includes('link') ||
                                 lower.includes('litecoin') || lower.includes('ltc') ||
                                 lower.includes('weather') || lower.includes('temperature') || lower.includes('temp'));
         
         if (isRealTimeQuery) {
            console.log('🔄 Fetching live data...');
         }
         
         const answer = await processQuery(question);
         console.log('💡', answer);
         
      } catch (error) {
         console.log('❌ Error:', error.message);
         console.log('💡 Try using command line mode: node index.js bitcoin price');
         break;
      }
   }
}