const drinks = {
  cola: { name: "cola", price: 20 },
  water: { name: "water", price: 15 },
};

class UpiPayment {
  approve(request) {
    if (!request.reference || request.amount <= 0) {
      return { approved: false, reason: "Payment failed." };
    }
    return { approved: true };
  }

}

class VendingMachine {
  constructor(stock, payment) {
    this.stock = { ...stock };
    this.payment = payment;
    this.earnings = 0;
  }

  buy(drinkName, paymentReference) {
    const drink = drinks[drinkName];
    if (!drink) {
      return { status: "rejected", message: "That drink is not sold here." };
    }

    if ((this.stock[drinkName] || 0) < 1) {
      return { status: "sold_out", message: `${drink.name} is sold out.` };
    }

    const payment = this.payment.approve({
      reference: paymentReference,
      amount: drink.price,
    });
    if (!payment.approved) {
      return { status: "payment_failed", message: payment.reason };
    }

    this.stock[drinkName] -= 1;
    this.earnings += drink.price;
    return { status: "completed", message: `Collect your ${drink.name}.` };
  }
}

const machine = new VendingMachine({ cola: 1, water: 1 }, new UpiPayment());
console.log(machine.buy("cola", "upi-ref-1001"));
console.log(machine.buy("water", ""));
console.log(machine.buy("cola", "upi-ref-1002"));
