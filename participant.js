
// Phase 1 Course - Participant Management

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const message = document.getElementById("participant-message");
const list = document.getElementById("participant-list");
const searchInput = document.getElementById("participant-search");

let registrations = [];

async function loadParticipants() {
    try {
        // Verify login
        const { data: sessionData, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError || !sessionData.session) {
            window.location.href = "admin.html";
            return;
        }

        // Verify admin role
        const { data: profile, error: profileError } =
            await supabaseClient
                .from("profiles")
                .select("role")
                .eq("id", sessionData.session.user.id)
                .single();

        if (
            profileError ||
            !["admin", "super_admin"].includes(profile?.role)
        ) {
            await supabaseClient.auth.signOut();
            window.location.href = "admin.html";
            return;
        }

        // Load registrations and participant details
        const { data, error } = await supabaseClient
            .from("registrations")
            .select(`
                registration_number,
                section,
                status,
                created_at,
                participants (
                    full_name,
                    contact_number,
                    school_troop,
                    district,
                    email
                )
            `)
            .order("created_at", { ascending: false });

        if (error) throw error;

        registrations = data || [];
        displayParticipants(registrations);

    } catch (error) {
        message.textContent =
            "Could not load participants: " + error.message;
    }
}

function displayParticipants(items) {
    list.replaceChildren();

    if (items.length === 0) {
        message.textContent = "No matching participants found.";
        return;
    }

    message.textContent = `Total registrations: ${items.length}`;

    items.forEach((registration) => {
        const participant = registration.participants;

        const card = document.createElement("div");
        const heading = document.createElement("h3");
        const details = document.createElement("p");

        heading.textContent =
            participant?.full_name || "Unknown participant";

        details.textContent = [
            `Registration: ${registration.registration_number}`,
            `Section: ${registration.section}`,
            `Contact: ${participant?.contact_number || "-"}`,
            `School/Troop: ${participant?.school_troop || "-"}`,
            `District: ${participant?.district || "-"}`,
            `Email: ${participant?.email || "-"}`,
            `Status: ${registration.status}`
        ].join(" | ");

        card.appendChild(heading);
        card.appendChild(details);

        list.appendChild(card);
    });
}

// Search by name, registration number, section,
// contact number, school/troop or district.
searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();

    const filtered = registrations.filter((registration) => {
        const participant = registration.participants || {};

        const searchableText = [
            registration.registration_number,
            registration.section,
            registration.status,
            participant.full_name,
            participant.contact_number,
            participant.school_troop,
            participant.district,
            participant.email
        ].join(" ").toLowerCase();

        return searchableText.includes(query);
    });

    displayParticipants(filtered);
});

loadParticipants();
