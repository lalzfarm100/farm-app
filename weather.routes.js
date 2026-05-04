const express = require('express');
const router = express.Router();
const auth = require('./auth.middleware');
const axios = require('axios');

const ACCUWEATHER_KEY = process.env.ACCUWEATHER_KEY || '';

// Farm precautions based on weather
function getPrecautions(forecast) {
  const precautions = [];
  const temp = forecast.Temperature?.Maximum?.Value || 0;
  const hasRain = forecast.Day?.HasPrecipitation || forecast.Night?.HasPrecipitation;
  const rainProb = forecast.Day?.PrecipitationProbability || 0;
  const windSpeed = forecast.Day?.Wind?.Speed?.Value || 0;

  if (hasRain || rainProb > 50) {
    precautions.push('🌧️ Rain expected — move hay/fodder inside, check shed drainage');
    precautions.push('💊 Postpone vaccination if rain is heavy');
    precautions.push('🐄 Keep newborn calves and pregnant cows in covered area');
  }
  if (temp > 40) {
    precautions.push('🌡️ Extreme heat — increase water supply (3x normal)');
    precautions.push('🕐 Do morning milking early (before 7 AM) to reduce heat stress');
    precautions.push('🌿 Provide shade and cool water, reduce afternoon activity');
  }
  if (temp > 35) {
    precautions.push('☀️ High heat — monitor milk yield, may drop 10-15%');
    precautions.push('💧 Ensure continuous fresh water access for all animals');
  }
  if (temp < 5) {
    precautions.push('❄️ Cold night — cover calves with jute/blanket');
    precautions.push('🍼 Check newborns every 3 hours in cold weather');
    precautions.push('🌾 Increase dry fodder for body heat generation');
  }
  if (windSpeed > 40) {
    precautions.push('💨 Strong winds — secure loose items, check shed roof');
  }
  if (precautions.length === 0) {
    precautions.push('✅ Good weather conditions — normal farm operations');
  }
  return precautions;
}

// ── GET current weather + forecast ────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    if (!ACCUWEATHER_KEY) {
      // Return mock data if no API key
      return res.json({
        ok: true,
        current: {
          temp: 34,
          description: 'Partly Cloudy',
          humidity: 45,
          wind: 12,
          feelsLike: 36,
          icon: '☁️'
        },
        forecast: [
          { date: new Date().toISOString().split('T')[0], high: 36, low: 24, rain: false, rainProb: 10, description: 'Sunny', precautions: ['✅ Good weather — normal operations'] },
          { date: new Date(Date.now()+86400000).toISOString().split('T')[0], high: 38, low: 26, rain: false, rainProb: 20, description: 'Hot', precautions: ['☀️ High heat — ensure water supply'] },
          { date: new Date(Date.now()+172800000).toISOString().split('T')[0], high: 32, low: 22, rain: true, rainProb: 70, description: 'Rain expected', precautions: ['🌧️ Rain expected — move fodder inside'] },
        ],
        location: 'Multan, Pakistan',
        note: 'Add AccuWeather API key in settings for live weather'
      });
    }

    // Get location key for Multan
    const locResponse = await axios.get(
      `http://dataservice.accuweather.com/locations/v1/cities/search?apikey=${ACCUWEATHER_KEY}&q=Multan,Pakistan`
    );
    const locationKey = locResponse.data[0]?.Key || '267263';

    // Current conditions
    const currentRes = await axios.get(
      `http://dataservice.accuweather.com/currentconditions/v1/${locationKey}?apikey=${ACCUWEATHER_KEY}&details=true`
    );
    const current = currentRes.data[0];

    // 5-day forecast
    const forecastRes = await axios.get(
      `http://dataservice.accuweather.com/forecasts/v1/daily/5day/${locationKey}?apikey=${ACCUWEATHER_KEY}&metric=true&details=true`
    );
    const forecasts = forecastRes.data.DailyForecasts;

    res.json({
      ok: true,
      current: {
        temp: current.Temperature.Metric.Value,
        description: current.WeatherText,
        humidity: current.RelativeHumidity,
        wind: current.Wind.Speed.Metric.Value,
        feelsLike: current.RealFeelTemperature.Metric.Value,
      },
      forecast: forecasts.map(f => ({
        date: f.Date.split('T')[0],
        high: f.Temperature.Maximum.Value,
        low: f.Temperature.Minimum.Value,
        rain: f.Day.HasPrecipitation || f.Night.HasPrecipitation,
        rainProb: f.Day.PrecipitationProbability,
        description: f.Day.LongPhrase,
        precautions: getPrecautions(f)
      })),
      location: 'Multan, Pakistan'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST update farm location ──────────────────────────────
router.post('/location', auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const { pool } = require('./database');
    await pool.execute('UPDATE farms SET lat=?, lng=? WHERE id=?',
      [lat, lng, req.user.farmId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
