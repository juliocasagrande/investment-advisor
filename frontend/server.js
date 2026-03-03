const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir arquivos estaticos da pasta dist
app.use(express.static(path.join(__dirname, 'dist')));

// Para SPA - redirecionar todas as rotas para index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Frontend rodando na porta ' + PORT);
});
