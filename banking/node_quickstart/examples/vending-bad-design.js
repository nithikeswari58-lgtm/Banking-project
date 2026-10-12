var stock = 1;
var earnings = 0;

function buyDrink(drink, upiPin) {
  if (drink == "cola") {
    if (stock > 0) {
      if (upiPin == "1234") {
        stock = stock - 1;
        earnings = earnings + 20;
        console.log("take cola");
      } else {
        console.log("fail");
      }
    } else {
      console.log("sold out");
    }
  } else if (drink == "water") {
    if (stock > 0) {
      if (upiPin == "1234") {
        stock = stock - 1;
        earnings = earnings + 20;
        console.log("take water");
      } else {
        console.log("fail");
      }
    } else {
      console.log("sold out");
    }
  } else {
    console.log("fail");
  }
}

buyDrink("cola", "1234");
buyDrink("water", "0000");
console.log("stock", stock, "earnings", earnings);
