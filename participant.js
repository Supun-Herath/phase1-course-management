
// PHASE 1 COURSE - PARTICIPANT MANAGEMENT

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";
const BATCH_ID = "5b1c2d61-dc49-4dc2-b9a6-92ce716eaeff";
const BUCKET = "phase1-result-pdfs";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const message = document.getElementById("participant-message");
const list = document.getElementById("participant-list");
const searchInput = document.getElementById("participant-search");

let registrations = [];
let adminUser = null;
let completions = [];
let documents = [];

function showMessage(text) {
    message.textContent = text;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function safeFilename(name) {
    return String(name || "Participant")
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_") + ".pdf";
}

async function verifyAdmin() {
    const { data, error } = await db.auth.getSession();

    if (error || !data.session) {
        window.location.href = "admin.html";
        return false;
    }

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .single();

    if (
        profileError ||
        !["admin", "super_admin"].includes(profile?.role)
    ) {
        await db.auth.signOut();
        window.location.href = "admin.html";
        return false;
    }

    adminUser = data.session.user;
    return true;
}

// LOAD PARTICIPANTS AND RELATED RECORDS

async function loadParticipants() {
    try {
        showMessage("Loading participants...");
        list.replaceChildren();

        const { data, error } = await db
            .from("registrations")
            .select(`
                id,
                registration_number,
                section,
                status,
                participants (
                    full_name,
                    contact_number,
                    school_troop,
                    district,
                    email
                ),
                results (
                    marks,
                    grade,
                    remarks
                )
            `)
            .eq("batch_id", BATCH_ID)
            .neq("status", "cancelled")
            .order("registration_number");

        if (error) throw error;

        registrations = data || [];

        const [completionResult, documentResult] = await Promise.all([
            db.from("course_completions")
                .select("*"),

            db.from("result_documents")
                .select("*")
                .order("version", { ascending: false })
        ]);

        if (completionResult.error) throw completionResult.error;
        if (documentResult.error) throw documentResult.error;

        completions = completionResult.data || [];
        documents = documentResult.data || [];

        displayParticipants(registrations);

    } catch (error) {
        showMessage("Could not load participants: " + error.message);
    }
}

// GET COMPLETION RECORD

function getCompletion(registrationId) {
    return completions.find(
        item => item.registration_id === registrationId
    );
}

// GET LATEST PDF RECORD

function getLatestDocument(completionId) {
    return documents
        .filter(item => item.completion_id === completionId)
        .sort((a, b) => b.version - a.version)[0];
}

// PARTICIPANT TABLE

function displayParticipants(items) {
    list.replaceChildren();

    if (!items.length) {
        showMessage("No matching participants found.");
        return;
    }

    showMessage(`Showing ${items.length} participant(s).`);

    const table = document.createElement("table");
    table.className = "participant-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    [
        "Registration No.",
        "Participant Name",
        "Section",
        "School / Troop",
        "Contact Number",
        "District",
        "Email",
        "Registration Status",
        "Course Complete",
        "Result Sheet"
    ].forEach(title => {
        const th = document.createElement("th");
        th.textContent = title;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");

    items.forEach(registration => {
        const participant = registration.participants || {};
        const completion = getCompletion(registration.id);

        const row = document.createElement("tr");

        const values = [
            registration.registration_number,
            participant.full_name,
            registration.section,
            participant.school_troop,
            participant.contact_number,
            participant.district,
            participant.email,
            registration.status
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value || "-";
            row.appendChild(cell);
        });

        // COMPLETION CHECKBOX

        const completionCell = document.createElement("td");
        const completionLabel = document.createElement("label");

        completionLabel.className = "completion-control";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked =
            completion?.completion_status === "completed";

        const checkboxText = document.createElement("span");
        checkboxText.textContent = "Completed";

        completionLabel.append(checkbox, checkboxText);
        completionCell.appendChild(completionLabel);

        // PDF DOWNLOAD BUTTON

        const pdfCell = document.createElement("td");
        pdfCell.className = "participant-actions";

        const pdfButton = document.createElement("button");
        pdfButton.type = "button";
        pdfButton.textContent = "Download Result PDF";
        pdfButton.disabled =
            completion?.completion_status !== "completed";

        pdfCell.appendChild(pdfButton);

        row.append(completionCell, pdfCell);
        tbody.appendChild(row);

        // SAVE COMPLETION IMMEDIATELY

        checkbox.addEventListener("change", async () => {
            const previousValue = !checkbox.checked;

            checkbox.disabled = true;
            showMessage(
                `Saving completion status for ${participant.full_name}...`
            );

            try {
                const completed = checkbox.checked;

                const completionDate = completed
                    ? new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Colombo"
                    }).format(new Date())
                    : null;

                const { data, error } = await db
                    .from("course_completions")
                    .upsert({
                        registration_id: registration.id,
                        completion_status: completed
                            ? "completed"
                            : "pending",
                        completion_date: completionDate,
                        approved_by: adminUser.id,
                        approved_at: new Date().toISOString()
                    }, {
                        onConflict: "registration_id"
                    })
                    .select("*")
                    .single();

                if (error) throw error;

                const existingIndex = completions.findIndex(
                    item => item.registration_id === registration.id
                );

                if (existingIndex >= 0) {
                    completions[existingIndex] = data;
                } else {
                    completions.push(data);
                }

                pdfButton.disabled = !completed;

                if (!completed) {
                    pdfButton.textContent = "Download Result PDF";
                }

                showMessage(
                    `${participant.full_name}: completion status saved.`
                );

            } catch (error) {
                checkbox.checked = previousValue;

                showMessage(
                    "Could not save completion: " + error.message
                );

            } finally {
                checkbox.disabled = false;
            }
        });

        // DOWNLOAD OR GENERATE PDF

        pdfButton.addEventListener("click", async () => {
            const currentCompletion = getCompletion(registration.id);

            if (
                !currentCompletion ||
                currentCompletion.completion_status !== "completed"
            ) {
                showMessage("Mark the participant as completed first.");
                return;
            }

            pdfButton.disabled = true;
            pdfButton.textContent = "Preparing PDF...";

            try {
                let latestDocument = getLatestDocument(
                    currentCompletion.id
                );

                if (!latestDocument) {
                    showMessage("Generating and saving result PDF...");

                    latestDocument = await generatePDF(
                        registration,
                        currentCompletion
                    );
                }

                const { data: file, error } = await db.storage
                    .from(BUCKET)
                    .download(latestDocument.storage_path);

                if (error) throw error;

                const url = URL.createObjectURL(file);
                const link = document.createElement("a");

                link.href = url;
                link.download = safeFilename(participant.full_name);

                document.body.appendChild(link);
                link.click();
                link.remove();

                setTimeout(() => URL.revokeObjectURL(url), 1000);

                showMessage(
                    `Result PDF downloaded for ${participant.full_name}.`
                );

                pdfButton.textContent = "Download Again";

            } catch (error) {
                showMessage("PDF download failed: " + error.message);
                pdfButton.textContent = "Download Result PDF";

            } finally {
                pdfButton.disabled = false;
            }
        });
    });

    table.append(thead, tbody);
    list.appendChild(table);
}

// CREATE RESULT SHEET

function createResultSheet(registration, completion) {
    const participant = registration.participants || {};
    const result = Array.isArray(registration.results)
        ? registration.results[0]
        : registration.results;

    const sheet = document.createElement("div");

    sheet.style.cssText = `
        width: 180mm;
        padding: 15mm;
        background: white;
        color: #202b26;
        font-family: Arial, sans-serif;
        box-sizing: border-box;
    `;

    sheet.innerHTML = `
        <div style="text-align:center;border-bottom:2px solid #245b40;padding-bottom:15px;">
            <h1 style="color:#245b40;">PHASE 1 COURSE</h1>
            <h2>PARTICIPANT RESULT SHEET</h2>
        </div>

        <div style="margin-top:30px;line-height:2;">
            <p><strong>Registration Number:</strong>
                ${escapeHTML(registration.registration_number)}</p>

            <p><strong>Full Name:</strong>
                ${escapeHTML(participant.full_name)}</p>

            <p><strong>School / Troop:</strong>
                ${escapeHTML(participant.school_troop)}</p>

            <p><strong>District:</strong>
                ${escapeHTML(participant.district)}</p>

            <p><strong>Section:</strong>
                ${escapeHTML(registration.section)}</p>

            <p><strong>Completion Date:</strong>
                ${escapeHTML(completion.completion_date)}</p>

            <p><strong>Completion Status:</strong> COMPLETED</p>

            <p><strong>Marks:</strong>
                ${escapeHTML(result?.marks ?? "Not recorded")}</p>

            <p><strong>Grade:</strong>
                ${escapeHTML(result?.grade || "Not recorded")}</p>

            <p><strong>Remarks:</strong>
                ${escapeHTML(result?.remarks || "-")}</p>
        </div>

        <div style="margin-top:75px;display:flex;justify-content:space-between;">
            <div style="text-align:center;">
                ______________________<br>
                Authorized Signature
            </div>

            <div style="text-align:center;">
                ______________________<br>
                Course Coordinator
            </div>
        </div>

        <p style="text-align:center;margin-top:50px;font-size:11px;">
            Official Phase 1 Course Result Document
        </p>
    `;

    return sheet;
}

// GENERATE PDF AND SAVE TO SUPABASE

async function generatePDF(registration, completion) {
    const { data: previousDocuments, error: versionError } = await db
        .from("result_documents")
        .select("version")
        .eq("completion_id", completion.id)
        .order("version", { ascending: false })
        .limit(1);

    if (versionError) throw versionError;

    const version = (previousDocuments?.[0]?.version || 0) + 1;

    const sheet = createResultSheet(registration, completion);

    document.body.appendChild(sheet);

    let pdfBlob;

    try {
        pdfBlob = await html2pdf()
            .set({
                margin: 5,
                filename: `${registration.registration_number}.pdf`,
                image: {
                    type: "jpeg",
                    quality: 0.98
                },
                html2canvas: {
                    scale: 2,
                    useCORS: true
                },
                jsPDF: {
                    unit: "mm",
                    format: "a4",
                    orientation: "portrait"
                }
            })
            .from(sheet)
            .outputPdf("blob");

    } finally {
        sheet.remove();
    }

    const filePath =
        `${registration.registration_number}/result-v${version}.pdf`;

    const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(filePath, pdfBlob, {
            contentType: "application/pdf",
            upsert: false
        });

    if (uploadError) throw uploadError;

    const { data: savedDocument, error: recordError } = await db
        .from("result_documents")
        .insert({
            completion_id: completion.id,
            document_number:
                `${registration.registration_number}-V${version}`,
            storage_path: filePath,
            version,
            generated_by: adminUser.id
        })
        .select("*")
        .single();

    if (recordError) {
        throw new Error(
            "PDF uploaded, but document record failed: " +
            recordError.message
        );
    }

    documents.push(savedDocument);

    return savedDocument;
}

// SEARCH

searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();

    const filtered = registrations.filter(registration => {
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

// START

async function start() {
    try {
        if (!await verifyAdmin()) return;

        await loadParticipants();

    } catch (error) {
        showMessage("System error: " + error.message);
    }
}

start();
