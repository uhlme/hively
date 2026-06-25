import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI = null;

function getAIInstance() {
  if (!genAI) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API Key (VITE_GEMINI_API_KEY) fehlt in den Umgebungsvariablen.");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export async function getWeatherInsightFromGemini(weatherData) {
    try {
        const ai = getAIInstance();
        const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

        const pollenText = weatherData.dominantPollen 
            ? `Stärkste Pollenbelastung: ${weatherData.dominantPollen.name} (${weatherData.dominantPollen.value} grains/m³).` 
            : "Keine nennenswerte Pollenbelastung.";

        const prompt = `
Du bist ein erfahrener Imker-Experte aus der Schweiz. 
Hier sind die aktuellen Wetter- und Trachtdaten direkt am Bienenstand:
- Temperatur: ${weatherData.temperature}°C
- Wetterlage: ${weatherData.conditionText}
- Windgeschwindigkeit: ${weatherData.windSpeed} km/h
- Pollen: ${pollenText}

Aufgabe: 
Erkläre in maximal 2 kurzen Sätzen, was diese Situation konkret für das Verhalten der Bienen oder die Arbeit des Imkers bedeutet.
Formuliere praxisnah, motivierend und direkt (ohne Einleitung wie "Hallo").
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (e) {
        console.error("Fehler bei Gemini Insight:", e);
        return "KI-Einschätzung derzeit nicht verfügbar.";
    }
}
