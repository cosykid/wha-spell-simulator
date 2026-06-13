import torch

# We'll create a "batch" of 10 data points
N = 10
# Each data point has 1 feature
D_in = 1
# The output for each data point is a single value
D_out = 1

# Create our input data X
# Shape: (10 rows, 1 column)
X = torch.randn(N, D_in)

# Create our true target labels y by applying the "true" function
# and adding some noise for realism
true_W = torch.tensor([[2.0]])
true_b = torch.tensor(1.0)
y_true = X @ true_W + true_b + torch.randn(N, D_out) * 0.1 # Add a little noise

print(f"Input Data X (first 3 rows):\n {X[:3]}\n")
print(f"True Labels y_true (first 3 rows):\n {y_true[:3]}")

# Hyperparameters
learning_rate = 0.01
epochs = 100

# Let's re-initialize our random parameters
W = torch.randn(1, 1, requires_grad=True)
b = torch.randn(1, requires_grad=True)

print(f"Starting Parameters: W={W.item():.3f}, b={b.item():.3f}\n")

# The Training Loop
for epoch in range(epochs):
    ### STEP 1 & 2: Forward Pass and Loss Calculation ###
    y_hat = X @ W + b
    loss = torch.mean((y_hat - y_true)**2)

    ### STEP 3: Backward Pass (Calculate Gradients) ###
    loss.backward()

    ### STEP 4: Update Parameters (The Gradient Descent Step) ###
    # We wrap this in no_grad() because this is not part of the model's computation
    with torch.no_grad():
        W -= learning_rate * W.grad
        b -= learning_rate * b.grad

    ### STEP 5: Zero the Gradients ###
    # We must reset the gradients for the next iteration
    W.grad.zero_()
    b.grad.zero_()

    # Optional: Print progress
    if epoch % 10 == 0:
        print(f"Epoch {epoch:02d}: Loss={loss.item():.4f}, W={W.item():.3f}, b={b.item():.3f}")

print(f"\nFinal Parameters: W={W.item():.3f}, b={b.item():.3f}")
print(f"True Parameters:  W=2.000, b=1.000")