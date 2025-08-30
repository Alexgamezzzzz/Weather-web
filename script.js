// Open-Meteo does not require an API key
const searchBtn = document.getElementById("search-btn");
const cityInput = document.getElementById("city-input");

const cityNameElement = document.getElementById("city-name");
const temperatureValueElement = document.getElementById("temperature-value");
const feelsLikeValueElement = document.getElementById("feels-like-value"); // Updated ID
const humidityElement = document.getElementById("humidity");
const uvIndexElement = document.getElementById("uv-index");
const windSpeedValueElement = document.getElementById("wind-speed-value");
const windDirectionElement = document.getElementById("wind-direction");
const visibilityValueElement = document.getElementById("visibility-value");
const pressureValueElement = document.getElementById("pressure-value");
const airQualityElement = document.getElementById("air-quality");
const sunriseSunsetElement = document.getElementById("sunrise-sunset");
const timeElement = document.getElementById("time");

const hourlyBtn = document.getElementById("hourly-btn");
const dailyBtn = document.getElementById("daily-btn");
const forecastContainer = document.getElementById("forecast-container");

const tosPopupOverlay = document.getElementById("tos-popup-overlay");
const agreeBtn = document.getElementById("agree-btn");
const weatherContainer = document.querySelector(".weather-container");

let currentTempInCelsius = 0;
let currentFeelsLikeInCelsius = 0; // New global variable
let currentWindInKmh = 0;
let currentVisibilityInKm = 0;
let currentPressureInHpa = 0;

const CONVERSION_FACTORS = {
    temp: {
        celsius: (c) => c,
        fahrenheit: (c) => (c * 9/5) + 32,
        kelvin: (c) => c + 273.15,
    },
    wind: {
        kmh: (kmh) => kmh,
        mph: (kmh) => kmh * 0.621371,
        ms: (kmh) => kmh * 0.277778,
        bft: (kmh) => {
            if (kmh < 1) return 0;
            if (kmh < 6) return 1;
            if (kmh < 12) return 2;
            if (kmh < 20) return 3;
            if (kmh < 29) return 4;
            if (kmh < 39) return 5;
            if (kmh < 50) return 6;
            if (kmh < 62) return 7;
            if (kmh < 75) return 8;
            if (kmh < 89) return 9;
            if (kmh < 103) return 10;
            if (kmh < 118) return 11;
            return 12;
        },
        kn: (kmh) => kmh * 0.539957,
    },
    visibility: {
        km: (km) => km,
        miles: (km) => km * 0.621371,
    },
    pressure: {
        hPa: (hPa) => hPa,
        psi: (hPa) => hPa * 0.0145038,
        mmHg: (hPa) => hPa * 0.750062,
        kPa: (hPa) => hPa * 0.1,
        atm: (hPa) => hPa * 0.000986923,
    },
};

let activeInterval;
let weatherDataCache = {};

const map = L.map('map').setView([51.505, -0.09], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

let currentMarker = null;

function displayTime(timezone) {
    if (activeInterval) {
        clearInterval(activeInterval);
    }

    activeInterval = setInterval(() => {
        const now = new Date().toLocaleString("en-US", { timeZone: timezone });
        const date = new Date(now);
        
        let hours24 = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        
        let hours12 = hours24 % 12;
        hours12 = hours12 ? hours12 : 12;
        const ampm = hours24 >= 12 ? 'PM' : 'AM';
        
        timeElement.innerText = `${hours12}:${minutes}:${seconds} ${ampm}`;

        const bodyClassList = document.body.classList;
        bodyClassList.remove('day', 'evening', 'night-stars', 'sunrise');
        
        if (hours24 >= 22 || hours24 < 4) {
            bodyClassList.add('night-stars');
        } else if (hours24 >= 20) {
            bodyClassList.add('evening');
        } else if (hours24 >= 4 && hours24 < 8) {
            bodyClassList.add('sunrise');
        } else {
            bodyClassList.add('day');
        }
    }, 1000);
}

displayTime(Intl.DateTimeFormat().resolvedOptions().timeZone);

function showTosPopup() {
    const hasAgreed = localStorage.getItem("hasAgreedToTOS");

    if (!hasAgreed) {
        tosPopupOverlay.style.display = "flex";
        weatherContainer.classList.add("blur");
    } else {
        tosPopupOverlay.style.display = "none";
        weatherContainer.classList.remove("blur");
    }
}

agreeBtn.addEventListener("click", () => {
    localStorage.setItem("hasAgreedToTOS", "true");
    showTosPopup();
});

showTosPopup();

searchBtn.addEventListener("click", () => {
    const cityName = cityInput.value;
    if (cityName) {
        getCoordinatesAndWeather(cityName);
    }
});

hourlyBtn.addEventListener("click", () => {
    if (weatherDataCache.hourly) {
        displayForecast(weatherDataCache.hourly, "hourly");
        hourlyBtn.classList.add("active");
        dailyBtn.classList.remove("active");
    } else {
        alert("Please search for a city first.");
    }
});

dailyBtn.addEventListener("click", () => {
    if (weatherDataCache.daily) {
        displayForecast(weatherDataCache.daily, "daily");
        dailyBtn.classList.add("active");
        hourlyBtn.classList.remove("active");
    } else {
        alert("Please search for a city first.");
    }
});

async function getCoordinatesAndWeather(cityName) {
    const geoApiUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${cityName}`;
    
    try {
        const geoResponse = await fetch(geoApiUrl);
        if (!geoResponse.ok) {
            throw new Error('City not found in geocoding service.');
        }
        const geoData = await geoResponse.json();
        
        if (!geoData.results || geoData.results.length === 0) {
            throw new Error('City not found.');
        }

        const cityInfo = geoData.results[0];
        const latitude = cityInfo.latitude;
        const longitude = cityInfo.longitude;
        const resolvedCityName = cityInfo.name;

        map.setView([latitude, longitude], 13);
        if (currentMarker) {
            map.removeLayer(currentMarker);
        }
        currentMarker = L.marker([latitude, longitude]).addTo(map)
            .bindPopup(resolvedCityName)
            .openPopup();

        const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,weathercode,apparent_temperature,windspeed_10m,winddirection_10m,visibility,pressure_msl,precipitation&daily=temperature_2m_max,temperature_2m_min,weathercode,uv_index_max,precipitation_sum,sunrise,sunset&forecast_days=7&timezone=auto`;
        const weatherResponse = await fetch(weatherApiUrl);
        const weatherData = await weatherResponse.json();
        
        const airQualityApiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=european_aqi,pm10,pm2_5,carbon_monoxide,ozone,nitrogen_dioxide,sulphur_dioxide`;
        const airQualityResponse = await fetch(airQualityApiUrl);
        const airQualityData = await airQualityResponse.json();

        weatherDataCache.hourly = weatherData.hourly;
        weatherDataCache.daily = weatherData.daily;

        const timezone = weatherData.timezone;
        const weatherCode = weatherData.current_weather.weathercode;
        
        const currentTime = new Date(weatherData.current_weather.time);
        const currentHourIndex = weatherData.hourly.time.findIndex(time => new Date(time).getHours() === currentTime.getHours());

        const currentHumidity = weatherData.hourly.relativehumidity_2m[currentHourIndex];
        const windDirectionDegrees = weatherData.hourly.winddirection_10m[currentHourIndex];
        const visibilityMeters = weatherData.hourly.visibility[currentHourIndex];
        const pressureHpa = Math.round(weatherData.hourly.pressure_msl[currentHourIndex]);
        const uvIndex = weatherData.daily.uv_index_max[0];
        
        const airQualityIndex = airQualityData.hourly.european_aqi[currentHourIndex];
        const getAirQualityStatus = (aqi) => {
            if (aqi <= 20) return "Excellent";
            if (aqi <= 40) return "Good";
            if (aqi <= 60) return "Fair";
            if (aqi <= 80) return "Poor";
            if (aqi <= 100) return "Very Poor";
            return "Extremely Poor";
        };
        const airQualityStatus = getAirQualityStatus(airQualityIndex);
        
        const sunriseTime = new Date(weatherData.daily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const sunsetTime = new Date(weatherData.daily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        cityNameElement.innerText = resolvedCityName;
        humidityElement.innerText = `Relative Humidity: ${currentHumidity}%`;
        uvIndexElement.innerText = `UV Index: ${uvIndex}`;
        windDirectionElement.innerText = `Wind direction: ${getWindDirection(windDirectionDegrees)}`;
        airQualityElement.innerText = `Air Quality: ${airQualityStatus} (${airQualityIndex})`;
        sunriseSunsetElement.innerText = `Sunrise: ${sunriseTime} | Sunset: ${sunsetTime}`;

        currentTempInCelsius = weatherData.current_weather.temperature;
        currentFeelsLikeInCelsius = weatherData.hourly.apparent_temperature[currentHourIndex]; // Set the new global variable
        currentWindInKmh = weatherData.current_weather.windspeed;
        currentVisibilityInKm = Math.round(visibilityMeters / 1000);
        currentPressureInHpa = pressureHpa;

        // Update all displays after fetching new data
        updateDisplay('temp', 'celsius');
        updateDisplay('feels-like', 'celsius');
        updateDisplay('wind', 'kmh');
        updateDisplay('visibility', 'km');
        updateDisplay('pressure', 'hPa');

        const bodyClassList = document.body.classList;
        bodyClassList.remove('rain-effect', 'thunderstorm-effect', 'snow-effect', 'snow-effect-extreme');
        
        const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
        const thunderstormCodes = [95, 96, 99];
        const snowCodes = [71, 73, 75, 77, 56, 57];

        if (rainCodes.includes(weatherCode)) {
            bodyClassList.add('rain-effect');
        }
        
        if (thunderstormCodes.includes(weatherCode)) {
            bodyClassList.add('thunderstorm-effect');
        }

        if (snowCodes.includes(weatherCode)) {
            bodyClassList.add('snow-effect');
        }
        
        if (snowCodes.includes(weatherCode) && currentTempInCelsius <= -25) {
            bodyClassList.add('snow-effect-extreme');
        }

        displayTime(timezone);
        displayForecast(weatherData.daily, "daily");

    } catch (error) {
        if (error.message === 'Failed to fetch') {
            alert("Failed to fetch. Please check your internet connection or refresh if you have turned on the internet.");
        } else {
            alert(error.message);
        }
    }
}

function updateDisplay(type, unit) {
    let value, unitText;
    switch (type) {
        case 'temp':
            value = CONVERSION_FACTORS.temp[unit](currentTempInCelsius);
            unitText = unit === 'celsius' ? '°C' : unit === 'fahrenheit' ? '°F' : 'K';
            temperatureValueElement.innerText = `Temperature: ${value.toFixed(1)}${unitText}`;
            break;
        case 'feels-like':
            value = CONVERSION_FACTORS.temp[unit](currentFeelsLikeInCelsius);
            unitText = unit === 'celsius' ? '°C' : unit === 'fahrenheit' ? '°F' : 'K';
            feelsLikeValueElement.innerText = `Feels like: ${value.toFixed(1)}${unitText}`;
            break;
        case 'wind':
            value = CONVERSION_FACTORS.wind[unit](currentWindInKmh);
            unitText = unit === 'kmh' ? 'km/h' : unit === 'mph' ? 'mph' : unit === 'ms' ? 'm/s' : unit === 'bft' ? 'bft' : 'kn';
            windSpeedValueElement.innerText = `Wind Speed: ${value.toFixed(1)} ${unitText}`;
            break;
        case 'visibility':
            value = CONVERSION_FACTORS.visibility[unit](currentVisibilityInKm);
            unitText = unit === 'km' ? 'km' : 'miles';
            visibilityValueElement.innerText = `Visibility: ${value.toFixed(1)} ${unitText}`;
            break;
        case 'pressure':
            value = CONVERSION_FACTORS.pressure[unit](currentPressureInHpa);
            unitText = unit;
            pressureValueElement.innerText = `Pressure: ${value.toFixed(2)} ${unitText}`;
            break;
    }
}

function setupUnitListeners() {
    const allUnitButtons = document.querySelectorAll(".unit-selector .unit-btn");
    allUnitButtons.forEach(button => {
        button.addEventListener("click", (event) => {
            const unit = event.target.dataset.unit;
            const unitType = event.target.closest('.unit-box').dataset.type;
            
            event.target.closest('.unit-selector').querySelectorAll('.unit-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');

            updateDisplay(unitType, unit);
        });
    });
}
setupUnitListeners();

function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

function displayForecast(forecastData, view) {
    if (!forecastContainer) return;
    forecastContainer.innerHTML = '';
    
    if (view === "daily") {
        forecastData.time.forEach((date, index) => {
            const day = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
            const tempMax = Math.round(forecastData.temperature_2m_max[index]);
            const tempMin = Math.round(forecastData.temperature_2m_min[index]);
            const uvIndex = forecastData.uv_index_max[index];
            const precipitation = Math.round(forecastData.precipitation_sum[index]);

            const forecastCard = document.createElement("div");
            forecastCard.classList.add("forecast-card");
            forecastCard.innerHTML = `
                <div class="day">${day}</div>
                <div class="temp-range">${tempMax}°C / ${tempMin}°C</div>
                <div class="additional-info">
                    <p>💧: ${precipitation} mm</p>
                    <p>☀️: ${uvIndex}</p>
                </div>
            `;
            forecastContainer.appendChild(forecastCard);
        });
    } else if (view === "hourly") {
        const currentTime = new Date();
        const nowIndex = forecastData.time.findIndex(time => new Date(time) >= currentTime);
        
        const next24Hours = forecastData.time.slice(nowIndex, nowIndex + 25);

        next24Hours.forEach((time, index) => {
            const hour = new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
            const temp = Math.round(forecastData.temperature_2m[nowIndex + index]);
            const humidity = forecastData.relativehumidity_2m[nowIndex + index];
            const precipitation = forecastData.precipitation[nowIndex + index];

            const forecastCard = document.createElement("div");
            forecastCard.classList.add("forecast-card");
            forecastCard.innerHTML = `
                <div class="day">${hour}</div>
                <div class="temp-range">${temp}°C</div>
                <div class="additional-info">
                    <p>💧: ${precipitation.toFixed(1)} mm</p>
                    <p>🌞: ${humidity}%</p>
                </div>
            `;
            forecastContainer.appendChild(forecastCard);
        });
    }
}
