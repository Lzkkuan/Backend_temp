import app from "./app";

const PORT = Number(process.env.USER_PORT ?? 3001);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
