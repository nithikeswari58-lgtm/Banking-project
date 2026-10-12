const catalog = {
  cola: { name: "cola", price: 20, stock: 1 },
};

class ProductRepository {
  constructor(products) {
    this.products = products;
  }

  find(name) {
    return this.products[name] || null;
  }

  reduceStock(name) {
    this.products[name].stock -= 1;
  }
}

class PaymentRepository {
  constructor() {
    this.rows = [];
  }

  add(payment) {
    this.rows.push(payment);
    return payment;
  }
}

class UpiPayment {
  approve(reference, amount) {
    if (!reference || amount <= 0) {
      return { approved: false };
    }
    return { approved: true };
  }
}

class OrderFactory {
  create(product, paymentReference) {
    return {
      productName: product.name,
      amount: product.price,
      paymentReference,
      status: "completed",
    };
  }
}

function renderReceipt(result) {
  return result.message;
}

class VendingService {
  constructor(products, payments, upi, orders) {
    this.products = products;
    this.payments = payments;
    this.upi = upi;
    this.orders = orders;
  }

  buy(drinkName, paymentReference) {
    const product = this.products.find(drinkName);
    if (!product) {
      return { status: "rejected", message: "That drink is not sold here." };
    }
    if (product.stock < 1) {
      return { status: "sold_out", message: `${product.name} is sold out.` };
    }
    const payment = this.upi.approve(paymentReference, product.price);
    if (!payment.approved) {
      return { status: "payment_failed", message: "Payment failed." };
    }

    this.products.reduceStock(product.name);
    const saved = this.payments.add(this.orders.create(product, paymentReference));
    return { status: saved.status, message: `Collect your ${product.name}.` };
  }
}

const service = new VendingService(
  new ProductRepository(catalog),
  new PaymentRepository(),
  new UpiPayment(),
  new OrderFactory(),
);

console.log(renderReceipt(service.buy("cola", "upi-ref-1001")));
console.log(renderReceipt(service.buy("cola", "upi-ref-1002")));
