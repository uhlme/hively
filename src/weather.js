/**
 * weather.js - Handles fetching weather data based on geolocation.
 */

const WMO_CODES = {
    0: { label: 'Sonnig', emoji: '☀️' },
    1: { label: 'Heiter', emoji: '🌤️' },
    2: { label: 'Wolkig', emoji: '⛅' },
    3: { label: 'Bedeckt', emoji: '☁️' },
    45: { label: 'Nebel', emoji: '🌫️' },
    48: { label: 'Rauhreifnebel', emoji: '🌫️' },
    51: { label: 'Leichter Nieselregen', emoji: '🌧️' },
    53: { label: 'Nieselregen', emoji: '🌧️' },
    55: { label: 'Dichter Nieselregen', emoji: '🌧️' },
    56: { label: 'Leichter gefrierender Nieselregen', emoji: '🌧️' },
    57: { label: 'Dichter gefrierender Nieselregen', emoji: '🌧️' },
    61: { label: 'Leichter Regen', emoji: '🌧️' },
    63: { label: 'Regen', emoji: '🌧️' },
    65: { label: 'Starker Regen', emoji: '🌧️' },
    66: { label: 'Leichter gefrierender Regen', emoji: '🌧️' },
    67: { label: 'Starker gefrierender Regen', emoji: '🌧️' },
    71: { label: 'Leichter Schneefall', emoji: '🌨️' },
    73: { label: 'Schneefall', emoji: '🌨️' },
    75: { label: 'Starker Schneefall', emoji: '🌨️' },
    77: { label: 'Schneegriesel', emoji: '🌨️' },
    80: { label: 'Leichte Regenschauer', emoji: '🌦️' },
    81: { label: 'Regenschauer', emoji: '🌦️' },
    82: { label: 'Starke Regenschauer', emoji: '🌧️' },
    85: { label: 'Leichte Schneeschauer', emoji: '🌨️' },
    86: { label: 'Starke Schneeschauer', emoji: '🌨️' },
    95: { label: 'Gewitter', emoji: '🌩️' },
    96: { label: 'Gewitter mit leichtem Hagel', emoji: '⛈️' },
    99: { label: 'Gewitter mit starkem Hagel', emoji: '⛈️' }
};

export async function fetchCurrentWeather() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation wird von diesem Browser nicht unterstützt."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    
                    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
                    const response = await fetch(url);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    const current = data.current;
                    
                    if (!current) {
                         throw new Error("Keine aktuellen Wetterdaten in der Antwort gefunden.");
                    }
                    
                    const temp = current.temperature_2m;
                    const code = current.weather_code;
                    const conditionData = WMO_CODES[code] || { label: 'Unbekannt', emoji: '🌡️' };
                    
                    resolve({
                        temperature: temp,
                        conditionText: conditionData.label,
                        conditionEmoji: conditionData.emoji,
                        code: code
                    });

                } catch (error) {
                    console.error("Fehler beim Abrufen der Wetterdaten:", error);
                    reject(error);
                }
            },
            (error) => {
                console.warn("Standortabfrage fehlgeschlagen oder abgelehnt:", error.message);
                reject(error);
            },
            {
                timeout: 10000,
                maximumAge: 60000 // Cache for 1 min
            }
        );
    });
}

export async function fetchDashboardWeatherAndPollen() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation wird von diesem Browser nicht unterstützt."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    
                    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`;
                    const pollenUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`;
                    
                    const [weatherRes, pollenRes] = await Promise.all([
                        fetch(weatherUrl),
                        fetch(pollenUrl)
                    ]);
                    
                    if (!weatherRes.ok || !pollenRes.ok) {
                        throw new Error("Fehler beim Abrufen der Dashboard-Daten");
                    }
                    
                    const weatherData = await weatherRes.json();
                    const pollenData = await pollenRes.json();
                    
                    const temp = weatherData.current?.temperature_2m;
                    const code = weatherData.current?.weather_code;
                    const wind = weatherData.current?.wind_speed_10m;
                    const conditionData = WMO_CODES[code] || { label: 'Unbekannt', emoji: '🌡️' };
                    
                    const p = pollenData.current || {};
                    const pollenLevels = [
                        { name: 'Erle', value: p.alder_pollen || 0 },
                        { name: 'Birke', value: p.birch_pollen || 0 },
                        { name: 'Gräser', value: p.grass_pollen || 0 },
                        { name: 'Beifuß', value: p.mugwort_pollen || 0 },
                        { name: 'Olive', value: p.olive_pollen || 0 },
                        { name: 'Traubenkraut', value: p.ragweed_pollen || 0 }
                    ];
                    
                    pollenLevels.sort((a, b) => b.value - a.value);
                    const dominantPollen = pollenLevels[0].value > 1 ? pollenLevels[0] : null;
                    
                    resolve({
                        temperature: temp,
                        conditionText: conditionData.label,
                        conditionEmoji: conditionData.emoji,
                        windSpeed: wind,
                        dominantPollen: dominantPollen,
                        allPollen: p
                    });

                } catch (error) {
                    console.error("Fehler beim Abrufen von Wetter/Pollen:", error);
                    reject(error);
                }
            },
            (error) => {
                console.warn("Standortabfrage fehlgeschlagen:", error.message);
                reject(error);
            },
            { timeout: 10000, maximumAge: 60000 }
        );
    });
}

