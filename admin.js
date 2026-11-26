
// Phase 1 Course - Admin Authentication

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const loginForm = document.getElementById("admin-login-form");
const messageBox = document.getElementById("admin-message");
const loginButton = document.getElementById("admin-login-button");

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        messageBox.textContent = "";
        loginButton.disabled = true;
        loginButton.textContent = "Signing in...";

        const email = document.getElementById("admin-email").value.trim();
        const password = document.getElementById("admin-password").value;

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            const { data: profile, error: profileError } =
                await supabaseClient
                    .from("profiles")
                    .select("role")
                    .eq("id", data.user.id)
                    .single();

            if (profileError || !["admin", "super_admin"].includes(profile?.role)) {
                await supabaseClient.auth.signOut();
                throw new Error("You are not authorized to access the admin area.");
            }

            window.location.href = "dashboard.html";

        } catch (error) {
            messageBox.textContent = error.message || "Login failed.";
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = "Login";
        }
    });
}
