
// Phase 1 Course - Result PDF Management

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";
const BUCKET = "phase1-result-pdfs";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const message = document.getElementById("results-message");
const list = document.getElementById("results-list");
const generateAllButton = document.getElementById("generate-all");
const zipButton = document.getElementById("download-zip");

let completedParticipants = [];
let adminUser = null;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
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

async function loadParticipants() {
    const { data, error } = await db
        .from("course_completions")
        .select(`
            id,
            registration_id,
            completion_status,
            completion_date,
            registrations (
                registration_number,
                section,
                participants (
                    full_name,
                    school_troop,
                    district
                ),
                results (
                    marks,
                    grade,
                    remarks
                )
            )
        `)
        .eq("completion_status", "completed");

    if (error) throw error;

    completedParticipants = data || [];
    displayParticipants();
}

function displayParticipants() {
    list.replaceChildren();

    if (!completedParticipants.length) {
        message.textContent = "No completed participants found.";
        return;
    }

    message.textContent =
        `Completed participants: ${completedParticipants.length}`;

    completedParticipants.forEach(item => {
        const registration = item.registrations;
        const participant = registration?.participants;

        const card = document.createElement("div");
        card.className = "form-group";

        const heading = document.createElement("h3");
        heading.textContent =
            `${participant?.full_name || "Unknown"} — ${registration?.registration_number || ""}`;

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Generate PDF";

        button.addEventListener("click", async () => {
            button.disabled = true;
            button.textContent = "Generating...";

            try {
                await generatePDF(item);
                message.textContent =
                    `PDF generated for ${registration.registration_number}.`;
                button.textContent = "Generated";
            } catch (error) {
                message.textContent = "PDF failed: " + error.message;
                button.textContent = "Generate PDF";
            } finally {
                button.disabled = false;
            }
        });

        card.append(heading, button);
        list.appendChild(card);
    });
}

function createResultSheet(item) {
    const registration = item.registrations;
    const participant = registration?.participants;
    const result = registration?.results;

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
        <div style="text-align:center; border-bottom:2px solid #245b40; padding-bottom:15px;">
            <h1 style="color:#245b40;">PHASE 1 COURSE</h1>
            <h2>PARTICIPANT RESULT SHEET</h2>
        </div>

        <div style="margin-top:30px; line-height:2;">
            <p><strong>Registration Number:</strong>
                ${escapeHTML(registration?.registration_number)}</p>
            <p><strong>Full Name:</strong>
                ${escapeHTML(participant?.full_name)}</p>
            <p><strong>School / Troop:</strong>
                ${escapeHTML(participant?.school_troop)}</p>
            <p><strong>District:</strong>
                ${escapeHTML(participant?.district)}</p>
            <p><strong>Section:</strong>
                ${escapeHTML(registration?.section)}</p>
            <p><strong>Completion Date:</strong>
                ${escapeHTML(item.completion_date)}</p>
            <p><strong>Completion Status:</strong> COMPLETED</p>
            <p><strong>Marks:</strong>
                ${escapeHTML(result?.marks ?? "Not recorded")}</p>
            <p><strong>Grade:</strong>
                ${escapeHTML(result?.grade || "Not recorded")}</p>
            <p><strong>Remarks:</strong>
                ${escapeHTML(result?.remarks || "-")}</p>
        </div>

        <div style="margin-top:75px; display:flex; justify-content:space-between;">
            <div style="text-align:center;">
                ______________________<br>
                Authorized Signature
            </div>
            <div style="text-align:center;">
                ______________________<br>
                Course Coordinator
            </div>
        </div>

        <p style="text-align:center; margin-top:50px; font-size:11px;">
            Official Phase 1 Course Result Document
        </p>
    `;

    return sheet;
}

async function generatePDF(item) {
    const registration = item.registrations;

    if (!registration) {
        throw new Error("Registration information is missing.");
    }

    const { data: previousDocuments, error: versionError } = await db
        .from("result_documents")
        .select("version")
        .eq("completion_id", item.id)
        .order("version", { ascending: false })
        .limit(1);

    if (versionError) throw versionError;

    const version = (previousDocuments?.[0]?.version || 0) + 1;

    const sheet = createResultSheet(item);
    document.body.appendChild(sheet);

    let pdfBlob;

    try {
        pdfBlob = await html2pdf()
            .set({
                margin: 5,
                filename: `${registration.registration_number}.pdf`,
                image: { type: "jpeg", quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
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

    const { error: recordError } = await db
        .from("result_documents")
        .insert({
            completion_id: item.id,
            document_number: `${registration.registration_number}-V${version}`,
            storage_path: filePath,
            version,
            generated_by: adminUser.id
        });

    if (recordError) {
        throw new Error(
            "PDF uploaded, but document record failed: " + recordError.message
        );
    }

    return filePath;
}

generateAllButton.addEventListener("click", async () => {
    generateAllButton.disabled = true;

    let successful = 0;
    let failed = 0;

    for (const item of completedParticipants) {
        try {
            await generatePDF(item);
            successful++;
        } catch (error) {
            console.error(error);
            failed++;
        }

        message.textContent =
            `Generating PDFs: ${successful + failed}/${completedParticipants.length}`;
    }

    message.textContent =
        `Finished. Successful: ${successful}. Failed: ${failed}.`;

    generateAllButton.disabled = false;
});

zipButton.addEventListener("click", async () => {
    zipButton.disabled = true;
    zipButton.textContent = "Preparing ZIP...";

    try {
        const { data: documents, error } = await db
            .from("result_documents")
            .select("storage_path, document_number")
            .order("generated_at", { ascending: false });

        if (error) throw error;

        if (!documents?.length) {
            throw new Error("No generated PDFs found.");
        }

        const zip = new JSZip();

        for (const document of documents) {
            const { data: file, error: downloadError } = await db.storage
                .from(BUCKET)
                .download(document.storage_path);

            if (downloadError) throw downloadError;

            zip.file(`${document.document_number}.pdf`, file);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });

        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "Phase1-Result-PDFs.zip";
        link.click();

        URL.revokeObjectURL(url);

        message.textContent = "ZIP download prepared successfully.";

    } catch (error) {
        message.textContent = "ZIP download failed: " + error.message;
    } finally {
        zipButton.disabled = false;
        zipButton.textContent = "Download PDFs as ZIP";
    }
});

async function start() {
    try {
        if (!await verifyAdmin()) return;
        await loadParticipants();
    } catch (error) {
        message.textContent = "Error: " + error.message;
    }
}

start();
