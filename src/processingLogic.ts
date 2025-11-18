import { extractTextFromCv } from './utils/cvParser';
import { fetchAllLists, postCandidateUpdates, ApiListItem } from './services/apiClient';
import { callStage1_ExtractCvData, callStage2_MatchExpertise } from './services/openAiService';
import * as fs from 'fs/promises'; // We need this for deleting the file
import dotenv from 'dotenv';
import { downloadFileFromUrl } from './utils/fileDownloader';
import { chunkTextByTokens } from './utils/textChunker';
import { parseDate, parseYear } from './utils/parseYear';
import logger from './logger';
dotenv.config();

export const performCvProcessing = async (jobPayload: any) => {
    const { candidateId, fileUrl, jobCategory, preSelectedSpeciality } = jobPayload;
    let tempFilePath: string | null = null; // A variable to hold the temp path
    const logMeta = { candidateId: candidateId };
    logger.info(`preSelectedSpeciality.name: ${preSelectedSpeciality.name}`, logMeta);
    logger.info(`Starting CV processing job.`, logMeta);
    try {
        // 1. Extract text from the CV file
        logger.info(`Downloading file from: ${fileUrl}`, logMeta);
        tempFilePath = await downloadFileFromUrl(fileUrl);

        logger.info(`Extracting text from temporary file: ${tempFilePath}`, logMeta);
        const cvText = await extractTextFromCv(tempFilePath);
        logger.info(`Extracted CV text length: ${cvText.length} characters`, logMeta);

        // --- Sanity Check ---
        if (!cvText || cvText.trim().length < 50) {
            throw new Error('CV text extraction failed or text was empty.');
        }

        const textChunks = chunkTextByTokens(cvText, 10000);
        logger.info(`Split text into ${textChunks.length} chunks for Stage 1.`, logMeta);

        const stage1Promises = textChunks.map(chunk => callStage1_ExtractCvData(chunk));
        const stage1PartialResults = await Promise.all(stage1Promises);
        logger.info(`Successfully received ${stage1PartialResults.length} partial results from Stage 1.`, logMeta);

        // --- REDUCE: Consolidate the new, structured results ---
        const consolidatedData: { [key: string]: any } = {
            rawExpertiseAndSkills: new Set<string>(),
            organizationDetails: [],
            education: [],
        };
        const simpleFields: { [key: string]: any } = {};

        for (const result of stage1PartialResults) {
            // Handle simple fields (take the first one found)
            if (result.address && !simpleFields.address) simpleFields.address = result.address;
            if (result.city && !simpleFields.city) simpleFields.city = result.city;
            if (result.gender && !simpleFields.gender) simpleFields.gender = result.gender;
            if(result.totalExp && !simpleFields.totalExp) simpleFields.totalExp = result.totalExp;
            
            // Aggregate array fields
            if (result.workExperienceCountries) consolidatedData.workExperienceCountries = [...(consolidatedData.workExperienceCountries || []), ...result.workExperienceCountries];
            if (result.organizationDetails) consolidatedData.organizationDetails.push(...result.organizationDetails);
            if (result.education) consolidatedData.education.push(...result.education);
            if (result.rawExpertiseAndSkills) result.rawExpertiseAndSkills.forEach((item: string) => consolidatedData.rawExpertiseAndSkills.add(item));
        }

        const consolidatedExpertise: string[] = Array.from(consolidatedData.rawExpertiseAndSkills);
        logger.info(`Consolidated Expertise: ${consolidatedExpertise}, ${consolidatedExpertise.length} items`, logMeta);

        logger.info("Sanitizing consolidated data...", logMeta);
        if (consolidatedData.education && Array.isArray(consolidatedData.education)) {
            consolidatedData.education = consolidatedData.education.map(edu => {
                const sanitizedEdu = { ...edu };
                sanitizedEdu.startingYear = parseYear(edu.startingYear);
                sanitizedEdu.endingYear = parseYear(edu.endingYear);
                
                // Remove keys that are null after parsing to keep the object clean
                if (sanitizedEdu.startingYear === null) delete sanitizedEdu.startingYear;
                if (sanitizedEdu.endingYear === null) delete sanitizedEdu.endingYear;

                return sanitizedEdu;
            });
        }

        if (consolidatedData.organizationDetails && Array.isArray(consolidatedData.organizationDetails)) {
            consolidatedData.organizationDetails = consolidatedData.organizationDetails.map(org => {
                const sanitizedOrg = { ...org };
                sanitizedOrg.startWorkingDate = parseDate(org.startWorkingDate);
                sanitizedOrg.endWorkingDate = parseDate(org.endWorkingDate);

                // If end date is null or in the future, and 'present' isn't explicitly false, assume true.
                if (org.present !== false && (!sanitizedOrg.endWorkingDate || sanitizedOrg.endWorkingDate > new Date())) {
                    sanitizedOrg.present = true;
                }

                // Remove null date fields to keep the payload clean
                if (!sanitizedOrg.startWorkingDate) delete sanitizedOrg.startWorkingDate;
                if (!sanitizedOrg.endWorkingDate) delete sanitizedOrg.endWorkingDate;

                return sanitizedOrg;
            }).filter(org => org.name && org.role); // Filter out any entries that are missing critical info
        }
        
        // --- Stage 2: Matching ---
        logger.info("Fetching lists and calling Stage 2 for matching.", logMeta);
        const allLists = await fetchAllLists(jobCategory, preSelectedSpeciality?._id);
        const listNames = {
            subSpecialities: allLists.subSpecialities.map(i => i.name),
            privileges: allLists.privileges.map(i => i.name),
            skills: allLists.skills.map(i => i.name),
        };
        // logger.info(`Fetched list names: ${JSON.stringify(listNames)}`, logMeta);
        logger.info(`Job category: ${jobCategory}`, logMeta);
        const stage2Matches = await callStage2_MatchExpertise(consolidatedExpertise, listNames, jobCategory, preSelectedSpeciality);
        logger.info(`Successfully received matches from Stage 2.`, logMeta);
        logger.info(`Stage 2 Matches: ${JSON.stringify(stage2Matches)}`, logMeta);

        // --- Build Final Payload with NEW "Matrix" Structuring Logic ---
        const finalPayload: { [key: string]: any } = { ...simpleFields };

        if (consolidatedData.organizationDetails.length > 0) finalPayload.organizationDetails = consolidatedData.organizationDetails;
        if (consolidatedData.education.length > 0) finalPayload.education = consolidatedData.education;
        if (consolidatedData.workExperienceCountries?.length > 0) {
            // Remove duplicates
            finalPayload.workExperienceCountries = [...new Set(consolidatedData.workExperienceCountries)];
        }

        // Map and overwrite skills
        if (stage2Matches.matchedSkills?.length > 0) {
            finalPayload.skills = allLists.skills
                .filter((s: any) => stage2Matches.matchedSkills.includes(s.name))
                .map((s: any) => ({ skill: s._id }))
                .slice(0, 10); // Limit to top 10 skills
        } else {
            finalPayload.skills = [];
        }

        // --- NEW "Hierarchical Assembly" Logic ---
        if (jobCategory === 'Medical') {
            const newProfileSpecialities: any[] = [];
            const finalSpecialityId = preSelectedSpeciality?._id; // We'll stick to the user's choice for now

            // 1. Get the full list of matched privilege NAMES from the AI.
            const matchedPrivilegeNames = stage2Matches.matchedPrivileges || [];
            
            // 2. Create a lookup map for the AI's suggested sub-speciality NAMES for quick access.
            const matchedSubSpecialityNames = new Set(stage2Matches.matchedSubSpecialities || []);

            // 3. Create a map of the full sub-speciality objects from the DB, keyed by their ID.
            const subSpecialityMap = new Map(allLists.subSpecialities.map((sub: any) => [sub._id.toString(), sub]));

            // 4. Iterate through ALL privileges associated with the primary speciality.
            for (const subSpec of allLists.subSpecialities) {
                if (subSpec.privilages && Array.isArray(subSpec.privilages)) {
                    for (const privId of subSpec.privilages) {
                        // Find the full privilege object
                        const privilege = allLists.privileges.find((p: any) => p._id.toString() === privId.toString());
                        
                        // Is this privilege one that the AI recommended?
                        // AND is its parent sub-speciality one that the AI also recommended?
                        if (privilege && matchedPrivilegeNames.includes(privilege.name) && matchedSubSpecialityNames.has(subSpec.name)) {
                            
                            // It's a valid, Create the object.
                            newProfileSpecialities.push({
                                jobSpeciality: finalSpecialityId,
                                jobSubSpeciality: [subSpec._id],
                                jobPrivilage: [privilege._id]
                            });
                        }
                    }
                }
            }

            logger.info(`Constructed ${newProfileSpecialities.length} hierarchically valid profile speciality objects.`, logMeta);

            // Overwrite the specialization field with the newly constructed array
            finalPayload.specialization = [{
                profileSpecialities: newProfileSpecialities
            }];
        }
        logger.info(`Final payload constructed. Posting updates to Main API: ${JSON.stringify(finalPayload)}`, logMeta);
        await postCandidateUpdates(candidateId, finalPayload);

        logger.info(`Successfully processed and updated profile for candidate: ${candidateId}`, logMeta);

    }catch(err){
        logger.error(`Error processing CV for candidate ${candidateId}:`, err, logMeta);
        throw err;
    }finally {
        // 4. ALWAYS CLEAN UP THE TEMPORARY FILE
        if (tempFilePath) {
            try {
                await fs.unlink(tempFilePath);
                logger.info(`Cleaned up temporary file: ${tempFilePath}`, logMeta);
            } catch (cleanupError) {
                logger.error(`Failed to clean up temporary file ${tempFilePath}:`, cleanupError, logMeta);
            }
        }
    }
};