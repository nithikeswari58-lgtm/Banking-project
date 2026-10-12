const stuff = [];

function buy(input) {
  const connection = { id: Math.random() };
  const machine = { stock: 1 };
  const payment = { pin: input.pin };
  const order = { drink: input.drink };
  const receipt = { text: "" };
  const screen = { html: "" };

  const existing = stuff.find((row) => row.drink === input.drink);
  const left = existing ? Number(existing.stockLeft) : 1;

  if (left < 1) {
    screen.html = "<h1 style='color:red'>SOLD OUT</h1>";
    console.log(screen.html);
    return;
  }

  if (payment.pin !== "0000") {
    screen.html = "<h1 style='color:red'>PAYMENT FAILED</h1>";
    console.log(screen.html);
    return;
  }

  stuff.push({
    drink: order.drink,
    price: "20",
    customerName: input.name,
    upiPin: payment.pin,
    stockLeft: String(left - 1),
    paid: "yes",
    connectionId: connection.id,
    machine,
    receipt,
  });

  screen.html = "<h1 style='color:green'>TAKE " + order.drink + "</h1>";
  console.log(screen.html, "objects", connection.id);
}

buy({ drink: "cola", name: "Synthetic Customer", pin: "0000" });
buy({ drink: "cola", name: "Synthetic Customer", pin: "0000" });
console.log(stuff);
