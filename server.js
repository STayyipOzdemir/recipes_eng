const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.post('/recipe', async (req, res) => {
  let { recipeType, servings, prepTime, difficulty } = req.body;

  try {
    // 1) "kek" kelimesini "tatlı" ile değiştir: (isteğe bağlı)
    recipeType = recipeType.replace(/kek/gi, 'tatlı');

    // *** BURADA ÖNEMLİ DEĞİŞİKLİK: System & user prompt'u artık İngilizce tarif döndürüyor. ***
    // (Sadece JSON dönecek şekilde kurgulanmıştır.)
    const recipeResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-3.5-turbo", // GPT-4 erişiminiz varsa "gpt-4" kullanabilirsiniz
        messages: [
          {
            role: "system",
            content:
              "You are a recipe assistant who only responds in English. You provide correct and detailed recipes from world cuisines. Respond only in valid JSON, no extra text."
          },
          {
            role: "user",
            content: `Please provide a recipe of type "${recipeType}" for ${servings} servings, with a preparation time of "${prepTime}" minutes, and a difficulty level of "${difficulty}". Respond ONLY in the following valid JSON format without any additional text:

{
  "title": "Name of the recipe in English",
  "description": "Short description in English",
  "ingredients": ["Ingredient 1", "Ingredient 2", "..."],
  "steps": ["Step 1", "Step 2", "..."],
  "nutrition": {
    "calories": "....",
    "protein": "....",
    "fat": "....",
    "carbohydrates": "...."
  }
}`
          }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let recipeContent = recipeResponse.data.choices[0].message.content;

    // JSON formatını RegEx ile yakala
    const jsonMatch = recipeContent.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      throw new Error('Expected JSON format was not found in the response.');
    }
    recipeContent = jsonMatch[0];

    // JSON parse
    const recipeJson = JSON.parse(recipeContent);

    // 2) Tüm tarifi zaten İngilizce aldığımız için ek bir çeviri adımı gerekmez.
    //    Dolayısıyla Step #2 (Tarif başlığını İngilizceye çevirme) tamamen kaldırıldı.

    // 3) Tarifin fotoğrafını oluşturmak (prompt İngilizce)
    //    Burada recipeJson.title İngilizce olduğundan "cake" -> "dessert" dönüştürme yine isterseniz yapılabilir:
    let finalTitle = recipeJson.title.replace(/cake/gi, 'dessert');

    const imagePrompt = `${finalTitle}, a delicious dessert, high-quality food photograph, professional lighting, studio shot`;

    try {
      const imageResponse = await axios.post(
        'https://api.openai.com/v1/images/generations',
        {
          prompt: imagePrompt,
          n: 1,
          size: "512x512",
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const imageUrl = imageResponse.data.data[0].url;
      // Tarif verisine imageUrl ekle
      recipeJson.imageUrl = imageUrl;
    } catch (imageError) {
      console.error("Error generating image:", imageError.response ? imageError.response.data : imageError.message);
      // Görüntü başarısız olsa bile JSON döndürelim
      recipeJson.imageUrl = null;
    }

    // Sonuç
    res.json({ recipe: recipeJson });
  } catch (error) {
    console.error("Error getting recipe:", error.response ? error.response.data : error.message);
    res
      .status(500)
      .send("Error while generating recipe: " + (error.response ? JSON.stringify(error.response.data) : error.message));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
